import "dotenv/config";
import crypto from "node:crypto";
import Fastify from "fastify";
import { Langfuse } from "langfuse-node";

import { config } from "./config.js";
import type { ChatMessage, ChatRequest, ChatResponse, ErrorResponse, Prefer } from "./types.js";
import { requireAuth, HttpError } from "./lib/http.js";
import { chooseRoute } from "./lib/router.js";
import { pickAgi } from "./lib/agis.js";
import { ensureThread, loadThread, appendMessage, toChatRole } from "./lib/memory.js";
import { openaiRespond } from "./providers/openai.js";
import { geminiRespond } from "./providers/gemini.js";
import { enqueueActions } from "./lib/actions.js";
import { recordUsage } from "./lib/usage.js";

const app = Fastify({ logger: true });

const langfuse = new Langfuse({
  publicKey: config.langfuse.publicKey,
  secretKey: config.langfuse.secretKey,
  baseUrl: config.langfuse.baseUrl,
});

function nowIso() {
  return new Date().toISOString();
}

function asString(v: any, def = "") {
  const s = typeof v === "string" ? v : "";
  return (s || def).trim();
}

function safeJsonParse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function titleFromMessage(message: string) {
  const clean = message.replace(/\s+/g, " ").trim();
  return clean.length <= 60 ? clean : clean.slice(0, 57) + "...";
}

function normalizePrefer(v: any): Prefer {
  const s = String(v ?? "auto").trim().toLowerCase();
  if (s === "openai" || s === "gemini" || s === "auto") return s as Prefer;
  return "auto";
}

app.get("/health", async () => ({
  ok: true,
  service: "nova.agi.orchestrator",
  fabric_ready: true,
  ts: nowIso(),
}));

async function handleChat(req: any, reply: any) {
  let trace: any;
  try {
    requireAuth(req.headers?.authorization, config.orchestratorKey);

    const body = (req.body ?? {}) as ChatRequest;
    const project_id = asString(body.project_id, "global") || "global";
    const message = asString(body.message || body.text, "");
    if (!message) throw new HttpError(400, { ok: false, error: "message requerido" });

    let thread_id = asString(body.thread_id, "");
    if (!thread_id) thread_id = crypto.randomUUID();

    const user_id = body.user_id ?? null;
    const user_email = body.user_email ?? null;

    const prefer = normalizePrefer(body.prefer);
    const mode = body.mode ?? "auto";

    const allow_actions_header = req.headers?.["x-allow-actions"] ? String(req.headers["x-allow-actions"]) : null;
    const allow_actions = config.actions.requireHeader
      ? Boolean(body.allow_actions) && allow_actions_header === "1"
      : Boolean(body.allow_actions);

    trace = langfuse.trace({
      name: "NOVA_Decision_Matrix",
      sessionId: thread_id,
      userId: user_id || "anonymous",
      metadata: { project_id, mode, allow_actions },
    });

    await ensureThread({ project_id, thread_id });
    await appendMessage(project_id, thread_id, "user", message);

    const history = await loadThread(project_id, thread_id, 30);
    const historyMessages: ChatMessage[] = history
      .filter((m: any) => m.role !== "system")
      .map((m: any) => ({ role: toChatRole(m.role), content: m.content }));

    const route = await chooseRoute({ project_id, message, prefer, mode });
    const agi = pickAgi(route.intent, message);

    trace.update({ tags: [route.intent, agi.id, route.provider] });

    const wantJson = allow_actions && config.actions.enabled;

    const systemBase =
      `${agi.system_prompt}\n\n` +
      `Contexto:\n- project_id: ${project_id}\n- thread_id: ${thread_id}\n` +
      (user_email ? `- user_email: ${user_email}\n` : "") +
      `\nReglas:\n- Responde claro, directo, en español.\n- Si falta info, pregunta lo mínimo.\n`;

    const system = wantJson
      ? systemBase +
        "\nIMPORTANTE: Responde SOLO en JSON válido. Debe incluir la palabra JSON en el contenido.\n" +
        'Formato JSON esperado: {"reply": string, "actions": [{"command": string, "payload": any, "node_id"?: string}] }\n' +
        "Si no hay acciones, actions=[] y reply siempre va."
      : systemBase;

    const messages: ChatMessage[] = [{ role: "system", content: system }, ...historyMessages];
    messages.push({ role: "user", content: message });

    const generation = trace.generation({
      name: `LLM_Compute_${route.provider}`,
      model: route.model,
      input: messages,
    });

    let outText = "";
    let usage: { tokens_in?: number; tokens_out?: number } | undefined;

    if (route.provider === "openai") {
      const r = await openaiRespond({
        apiKey: config.openai.apiKey,
        model: route.model,
        messages,
        jsonMode: wantJson,
      });
      outText = r.text;
      usage = r.usage;
    } else {
      const r = await geminiRespond({
        apiKey: config.gemini.apiKey,
        model: route.model,
        messages,
        jsonMode: wantJson,
      });
      outText = r.text;
      usage = r.usage;
    }

    generation.end({
      output: outText,
      usage: usage ? { promptTokens: usage.tokens_in, completionTokens: usage.tokens_out } : undefined,
    });

    let replyText = outText;
    let actionsRaw: any[] = [];

    if (wantJson) {
      const obj = safeJsonParse(outText);
      if (obj && typeof obj === "object") {
        if (typeof obj.reply === "string") replyText = obj.reply;
        else if (typeof obj.text === "string") replyText = obj.text;
        actionsRaw = Array.isArray(obj.actions) ? obj.actions : [];
      }
    }

    const actionResult = await enqueueActions({
      project_id,
      allow_actions,
      allow_actions_header,
      actions: actionsRaw,
    });

    if (actionsRaw.length > 0) {
      trace.event({
        name: "Actions_Dispatched",
        input: { enqueued: actionResult.enqueued, blocked: actionResult.blocked },
      });
    }

    await appendMessage(project_id, thread_id, "assistant", replyText);

    await recordUsage({
      project_id,
      thread_id,
      provider: route.provider,
      model: route.model,
      tokens_in: usage?.tokens_in,
      tokens_out: usage?.tokens_out,
      meta: { intent: route.intent, agi_id: agi.id, reason: route.reason },
      trace_id: trace.id,
    });

    const res: ChatResponse = {
      ok: true,
      project_id,
      thread_id,
      provider: route.provider,
      model: route.model,
      intent: route.intent,
      agi_id: agi.id,
      reply: replyText,
      trace_id: trace.id,
      actions: actionResult.enqueued,
      meta: {
        router_reason: route.reason,
        want_json: wantJson,
        blocked_actions: actionResult.blocked?.length ? actionResult.blocked : undefined,
      },
    };

    trace.update({ statusMessage: "SUCCESS" });
    await langfuse.flushAsync();

    return reply.code(200).send(res);
  } catch (e: any) {
    if (trace) {
      trace.update({ level: "ERROR", statusMessage: e.message });
      await langfuse.flushAsync();
    }

    const status = e instanceof HttpError ? e.status : 500;
    const payload: ErrorResponse =
      e instanceof HttpError
        ? { ...e.payload, trace_id: trace?.id }
        : { ok: false, error: String(e?.message || e || "server_error"), trace_id: trace?.id };

    req.log.error({ err: e }, "chat_error");
    return reply.code(status).send(payload);
  }
}

app.post("/chat", handleChat);
app.post("/v1/chat", handleChat);

app.listen({ port: config.port, host: "0.0.0.0" }).catch((e) => {
  app.log.error(e);
  process.exit(1);
});