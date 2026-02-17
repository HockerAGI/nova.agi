import "dotenv/config";
import Fastify from "fastify";

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

// Health check (Cloud Run / Render)
app.get("/health", async () => ({ ok: true, service: "nova.agi", ts: nowIso() }));

async function handleChat(req: any, reply: any) {
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
    const allow_actions = Boolean(body.allow_actions);

    // Persistencia (thread + user message)
    await ensureThread({ project_id, thread_id, user_id, title: titleFromMessage(message) });
    await appendMessage(project_id, thread_id, "user", message);

    // Contexto de memoria
    const history = await loadThread(project_id, thread_id, 30);
    const historyMessages: ChatMessage[] = history
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: toChatRole(m.role), content: m.content }));

    // Router
    const route = await chooseRoute({ project_id, message, prefer, mode });
    const agi = pickAgi(route.intent, message);

    const wantJson = allow_actions && config.actions.enabled;

    const systemBase =
      `${agi.system_prompt}\n\n` +
      `Contexto:\n- project_id: ${project_id}\n- thread_id: ${thread_id}\n` +
      (user_email ? `- user_email: ${user_email}\n` : "") +
      `\nReglas:\n- Responde claro, directo, en español.\n- Si falta info, pregunta lo mínimo.\n`;

    const system = wantJson
      ? systemBase +
        "\nIMPORTANTE: Responde SOLO en JSON válido. Debe incluir la palabra JSON en el contenido.\n" +
        "Formato JSON esperado: {\"reply\": string, \"actions\": [{\"command\": string, \"payload\": any, \"node_id\"?: string}] }\n" +
        "Si no hay acciones, actions=[] y reply siempre va."
      : systemBase;

    const messages: ChatMessage[] = [{ role: "system", content: system }, ...historyMessages];

    // Evita duplicar el último user message del history (porque ya insertamos)
    // Aun así, añadimos el mensaje actual explícitamente para el modelo.
    messages.push({ role: "user", content: message });

    // Provider
    let outText = "";
    let usage: { tokens_in?: number; tokens_out?: number } | undefined;

    if (route.provider === "openai") {
      const r = await openaiRespond({ apiKey: config.openai.apiKey, model: route.model, messages, jsonMode: wantJson });
      outText = r.text;
      usage = r.usage;
    } else {
      const r = await geminiRespond({ apiKey: config.gemini.apiKey, model: route.model, messages, jsonMode: wantJson });
      outText = r.text;
      usage = r.usage;
    }

    // Parse JSON (si aplica)
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

    // Enqueue actions (seguro)
    const actionResult = await enqueueActions({
      project_id,
      allow_actions,
      allow_actions_header,
      actions: actionsRaw
    });

    // Persist assistant message (role "nova" para que el panel lo pinte como NOVA)
    await appendMessage(project_id, thread_id, "nova", replyText);

    // Usage best-effort
    await recordUsage({
      project_id,
      thread_id,
      provider: route.provider,
      model: route.model,
      tokens_in: usage?.tokens_in,
      tokens_out: usage?.tokens_out,
      meta: { intent: route.intent, agi_id: agi.id, reason: route.reason }
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
      actions: actionResult.enqueued,
      meta: {
        router_reason: route.reason,
        want_json: wantJson,
        blocked_actions: actionResult.blocked?.length ? actionResult.blocked : undefined
      }
    };

    return reply.code(200).send(res);
  } catch (e: any) {
    const status = e instanceof HttpError ? e.status : 500;
    const payload: ErrorResponse =
      e instanceof HttpError ? e.payload : { ok: false, error: String(e?.message || e || "server_error") };

    req.log.error({ err: e }, "chat_error");
    return reply.code(status).send(payload);
  }
}

// Compat: /chat y /v1/chat
app.post("/chat", handleChat);
app.post("/v1/chat", handleChat);

app.listen({ port: config.port, host: "0.0.0.0" }).catch((e) => {
  app.log.error(e);
  process.exit(1);
});