import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Fastify from "fastify";
import { Langfuse } from "langfuse-node";

import { config, modelFor } from "./config.js";
import type { ChatMessage, ChatRequest, ChatResponse, ErrorResponse, Prefer, Provider } from "./types.js";
import { requireAuth, HttpError } from "./lib/http.js";
import { chooseRoute } from "./lib/router.js";
import { pickAgi } from "./lib/agis.js";
import { ensureThread, loadThread, appendMessage, toChatRole } from "./lib/memory.js";
import { openaiRespond } from "./providers/openai.js";
import { geminiRespond } from "./providers/gemini.js";
import { enqueueActions } from "./lib/actions.js";
import { recordUsage } from "./lib/usage.js";
import { parseStableJson } from "./lib/stable-json.js";

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
  const stable = parseStableJson(text);
  if (stable) return stable;
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

function normalizeMode(v: any): "auto" | "fast" | "pro" {
  const s = String(v ?? "auto").trim().toLowerCase();
  if (s === "fast" || s === "pro" || s === "auto") return s as "auto" | "fast" | "pro";
  return "auto";
}

function providerAvailable(provider: Provider): boolean {
  return Boolean(provider === "openai" ? config.openai.apiKey : config.gemini.apiKey);
}

app.get("/health", async () => ({
  ok: true,
  service: "nova.agi.orchestrator",
  fabric_ready: true,
  hocker_one_api_url: config.hockerOneApiUrl,
  providers: {
    openai: providerAvailable("openai"),
    gemini: providerAvailable("gemini"),
  },
  command_dispatch_path: "/api/commands/dispatch",
  ts: nowIso(),
}));

async function callWithFallback(args: {
  preferred: Provider;
  mode: "auto" | "fast" | "pro";
  messages: ChatMessage[];
  jsonMode: boolean;
}) {
  const candidates: Provider[] =
    args.preferred === "openai"
      ? ["openai", "gemini"]
      : ["gemini", "openai"];

  let lastError: unknown = null;

  for (const provider of candidates) {
    if (!providerAvailable(provider)) continue;

    const apiKey = provider === "openai" ? config.openai.apiKey : config.gemini.apiKey;
    if (!apiKey) continue;

    const model = modelFor(provider, args.mode);

    try {
      const result =
        provider === "openai"
          ? await openaiRespond({
              apiKey,
              model,
              messages: args.messages,
              jsonMode: args.jsonMode,
            })
          : await geminiRespond({
              apiKey,
              model,
              messages: args.messages,
              jsonMode: args.jsonMode,
            });

      return { provider, model, ...result };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new HttpError(503, { ok: false, error: "No hay proveedor LLM disponible." });
}

export async function handleChat(req: any, reply: any) {
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
    const mode = normalizeMode(body.mode);

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

    const messages: ChatMessage[] = [{ role: "system", content: system }, ...historyMessages, { role: "user", content: message }];

    const generation = trace.generation({
      name: `LLM_Compute_${route.provider}`,
      model: route.model,
      input: messages,
    });

    const completion = await callWithFallback({
      preferred: route.provider,
      mode,
      messages,
      jsonMode: wantJson,
    });

    generation.end({
      output: completion.text,
      usage: completion.usage
        ? {
            promptTokens: completion.usage.tokens_in,
            completionTokens: completion.usage.tokens_out,
          }
        : undefined,
    });

    if (completion.provider !== route.provider) {
      trace.event({
        name: "Provider_Fallback",
        input: { requested: route.provider, used: completion.provider },
      });
    }

    let replyText = completion.text;
    let actionsRaw: any[] = [];

    if (wantJson) {
      const obj = safeJsonParse(completion.text);
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
      provider: completion.provider,
      model: completion.model,
      tokens_in: completion.usage?.tokens_in,
      tokens_out: completion.usage?.tokens_out,
      meta: {
        intent: route.intent,
        agi_id: agi.id,
        reason: route.reason,
        requested_provider: route.provider,
        used_provider: completion.provider,
        title: titleFromMessage(message),
      },
      trace_id: trace.id,
    });

    const res: ChatResponse = {
      ok: true,
      project_id,
      thread_id,
      provider: completion.provider,
      model: completion.model,
      intent: route.intent,
      agi_id: agi.id,
      reply: replyText,
      trace_id: trace.id,
      actions: actionResult.enqueued,
      meta: {
        router_reason: route.reason,
        want_json: wantJson,
        requested_provider: route.provider,
        used_provider: completion.provider,
        provider_fallback: completion.provider !== route.provider ? completion.provider : undefined,
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

const isMain = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false;

if (isMain) {
  app.listen({ port: config.port, host: "0.0.0.0" }).catch((e) => {
    app.log.error(e);
    process.exit(1);
  });
}

export { handleChat };