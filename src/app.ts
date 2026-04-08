import "dotenv/config";
import crypto from "node:crypto";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { Langfuse } from "langfuse-node";

import { config, modelFor } from "./config.js";
import type {
  Action,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ErrorResponse,
  JsonObject,
  JsonValue,
  Prefer,
  Provider,
} from "./types.js";
import { requireAuth, HttpError } from "./lib/http.js";
import { chooseRoute } from "./lib/router.js";
import { pickAgi } from "./lib/agis.js";
import { ensureThread, loadThread, appendMessage, toChatRole } from "./lib/memory.js";
import { openaiRespond, type OpenAiResult } from "./providers/openai.js";
import { geminiRespond, type GeminiResult } from "./providers/gemini.js";
import { ollamaRespond } from "./providers/ollama.js";
import { enqueueActions } from "./lib/actions.js";
import { recordUsage, tokensUsedThisMonth } from "./lib/usage.js";
import { parseStableJson } from "./lib/stable-json.js";

type CompletionMode = "auto" | "fast" | "pro";

type ChatHeaders = {
  authorization?: string;
  "x-allow-actions"?: string;
};

type CompletionGeneration = {
  end: (args: {
    output: string;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
    };
  }) => void;
};

type LangfuseTraceLike = {
  id?: string;
  event: (args: Record<string, unknown>) => void;
  update: (args: Record<string, unknown>) => void;
  generation: (args: Record<string, unknown>) => CompletionGeneration;
};

type CompletionResult = {
  provider: Provider;
  model: string;
  text: string;
  usage?: { tokens_in?: number; tokens_out?: number };
  fallbackUsed: boolean;
};

function createLangfuseClient(): Langfuse | null {
  try {
    return new Langfuse({
      publicKey: config.langfuse.publicKey,
      secretKey: config.langfuse.secretKey,
      baseUrl: config.langfuse.baseUrl,
    });
  } catch (error: unknown) {
    console.warn("Langfuse deshabilitado: no se pudo inicializar el cliente.", error);
    return null;
  }
}

const langfuse = createLangfuseClient();

function nowIso(): string {
  return new Date().toISOString();
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function normalizePrefer(value: unknown): Prefer {
  const s = String(value ?? "auto").trim().toLowerCase();
  if (s === "openai" || s === "gemini" || s === "auto") return s;
  return "auto";
}

function normalizeMode(value: unknown): CompletionMode {
  const s = String(value ?? "auto").trim().toLowerCase();
  if (s === "fast" || s === "pro" || s === "auto") return s;
  return "auto";
}

function titleFromMessage(message: string): string {
  const clean = message.replace(/\s+/g, " ").trim();
  return clean.length <= 60 ? clean : `${clean.slice(0, 57)}...`;
}

function safeJsonParse(text: string): unknown | null {
  const stable = parseStableJson(text);
  if (stable) return stable;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function buildSystemPrompt(args: {
  agiPrompt: string;
  project_id: string;
  thread_id: string;
  user_email?: string | null;
  wantJson: boolean;
}): string {
  const { agiPrompt, project_id, thread_id, user_email, wantJson } = args;

  const base =
    `${agiPrompt}\n\n` +
    `Contexto:\n- project_id: ${project_id}\n- thread_id: ${thread_id}\n` +
    (user_email ? `- user_email: ${user_email}\n` : "") +
    `\nReglas:\n- Responde claro, directo, en español.\n- Si falta info, pregunta lo mínimo.\n`;

  if (!wantJson) return base;

  return (
    base +
    "\nIMPORTANTE: Responde SOLO en JSON válido. Debe incluir la palabra JSON en el contenido.\n" +
    'Formato JSON esperado: {"reply": string, "actions": [{"command": string, "payload": object, "node_id"?: string}] }\n' +
    "Si no hay acciones, actions=[] y reply siempre va."
  );
}

function providerAvailable(provider: Provider): boolean {
  return Boolean(provider === "openai" ? config.openai.apiKey : config.gemini.apiKey);
}

function providerBudgetLimit(provider: Provider): number {
  return provider === "openai"
    ? config.budgets.openaiMonthlyTokens
    : config.budgets.geminiMonthlyTokens;
}

async function runCompletionWithFallback(args: {
  project_id: string;
  preferredProvider: Provider;
  mode: CompletionMode;
  messages: ChatMessage[];
  jsonMode: boolean;
}): Promise<CompletionResult> {

  const candidates: Array<Provider | "ollama"> =
    args.preferredProvider === "openai"
      ? ["openai", "gemini", "ollama"]
      : ["gemini", "openai", "ollama"];

  let lastError: unknown = null;

  for (const provider of candidates) {
    try {
      // 🔵 OPENAI
      if (provider === "openai" && config.openai.apiKey) {
        const result = await openaiRespond({
          apiKey: config.openai.apiKey,
          model: modelFor("openai", args.mode),
          messages: args.messages,
          jsonMode: args.jsonMode,
        });

        return {
          provider: "openai",
          model: modelFor("openai", args.mode),
          text: result.text,
          usage: result.usage,
          fallbackUsed: provider !== args.preferredProvider,
        };
      }

      // 🟣 GEMINI
      if (provider === "gemini" && config.gemini.apiKey) {
        const result = await geminiRespond({
          apiKey: config.gemini.apiKey,
          model: modelFor("gemini", args.mode),
          messages: args.messages,
          jsonMode: args.jsonMode,
        });

        return {
          provider: "gemini",
          model: modelFor("gemini", args.mode),
          text: result.text,
          usage: result.usage,
          fallbackUsed: provider !== args.preferredProvider,
        };
      }

      // 🟢 OLLAMA (LOCAL, SIN COSTO)
      if (provider === "ollama") {
        const result = await ollamaRespond({
          model: "llama3:8b",
          messages: args.messages,
        });

        return {
          provider: "ollama" as Provider,
          model: "llama3:8b",
          text: result.text,
          usage: undefined,
          fallbackUsed: provider !== args.preferredProvider,
        };
      }

    } catch (error) {
      lastError = error;
    }
  }

  throw new HttpError(503, {
    ok: false,
    error:
      lastError instanceof Error
        ? lastError.message
        : "No hay proveedor disponible",
  });
}

export async function handleChat(
  req: FastifyRequest<{ Body: ChatRequest; Headers: ChatHeaders }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  let trace: LangfuseTraceLike | null = null;

  try {
    requireAuth(req.headers.authorization, config.orchestratorKey);

    const body = req.body ?? {};
    const project_id = asString(body.project_id, "global") || "global";
    const message = asString(body.message || body.text, "");
    if (!message) throw new HttpError(400, { ok: false, error: "message requerido" });

    const thread_id = asString(body.thread_id, "") || crypto.randomUUID();
    const user_id = body.user_id ?? null;
    const user_email = body.user_email ?? null;

    const prefer = normalizePrefer(body.prefer);
    const mode = normalizeMode(body.mode);

    const allowActionsHeader = req.headers["x-allow-actions"]
      ? String(req.headers["x-allow-actions"])
      : null;

    const allow_actions = config.actions.requireHeader
      ? Boolean(body.allow_actions) && allowActionsHeader === "1"
      : Boolean(body.allow_actions);

    trace = langfuse
      ? (langfuse.trace({
          name: "NOVA_Decision_Matrix",
          sessionId: thread_id,
          userId: user_id || "anonymous",
          metadata: { project_id, mode, allow_actions },
        }) as unknown as LangfuseTraceLike)
      : null;

    await ensureThread({ project_id, thread_id });
    await appendMessage(project_id, thread_id, "user", message);

    const history = (await loadThread(project_id, thread_id, 30)) as Array<{
      role: string;
      content: string;
    }>;

    const historyMessages: ChatMessage[] = history
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: toChatRole(m.role), content: m.content }));

    const route = await chooseRoute({ project_id, message, prefer, mode });
    const agi = pickAgi(route.intent, message);
    const wantJson = allow_actions && config.actions.enabled;

    const system = buildSystemPrompt({
      agiPrompt: agi.system_prompt,
      project_id,
      thread_id,
      user_email,
      wantJson,
    });

    const messages: ChatMessage[] = [
      { role: "system", content: system },
      ...historyMessages,
      { role: "user", content: message },
    ];

    const generation = trace?.generation({
      name: `LLM_Compute_${route.provider}`,
      model: route.model,
      input: messages,
    });

    const completion = await runCompletionWithFallback({
      project_id,
      preferredProvider: route.provider,
      mode,
      messages,
      jsonMode: wantJson,
    });

    generation?.end({
      output: completion.text,
      usage: completion.usage
        ? {
            promptTokens: completion.usage.tokens_in,
            completionTokens: completion.usage.tokens_out,
          }
        : undefined,
    });

    if (completion.fallbackUsed) {
      trace?.event({
        name: "Provider_Fallback",
        input: { requested: route.provider, used: completion.provider },
      });
    }

    trace?.update({ tags: [route.intent, agi.id, completion.provider] });

    let replyText = completion.text;
    let actionsRaw: unknown[] = [];

    if (wantJson) {
      const obj = safeJsonParse(completion.text);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        const record = obj as Record<string, unknown>;
        if (typeof record.reply === "string") replyText = record.reply;
        else if (typeof record.text === "string") replyText = record.text;
        actionsRaw = Array.isArray(record.actions) ? record.actions : [];
      }
    }

    const actionResult = await enqueueActions({
      project_id,
      allow_actions,
      allow_actions_header: allowActionsHeader,
      actions: actionsRaw,
    });

    if (actionsRaw.length > 0) {
      trace?.event({
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
        trace_id: trace?.id ?? null,
      },
      trace_id: trace?.id,
    });

    const responseMeta: JsonObject = {
      router_reason: route.reason,
      want_json: wantJson,
      requested_provider: route.provider,
      used_provider: completion.provider,
    };

    if (completion.fallbackUsed) {
      responseMeta.provider_fallback = completion.provider;
    }

    if (Array.isArray(actionResult.blocked) && actionResult.blocked.length > 0) {
      responseMeta.blocked_actions = actionResult.blocked as unknown as JsonValue;
    }

    const res: ChatResponse = {
      ok: true,
      project_id,
      thread_id,
      provider: completion.provider,
      model: completion.model,
      intent: route.intent,
      agi_id: agi.id,
      reply: replyText,
      trace_id: trace?.id ?? null,
      actions: actionResult.enqueued as Action[],
      meta: responseMeta,
    };

    trace?.update({ statusMessage: "SUCCESS" });
    await langfuse?.flushAsync();

    return reply.code(200).send(res);
  } catch (error: unknown) {
    if (trace) {
      trace.update({
        level: "ERROR",
        statusMessage: error instanceof Error ? error.message : "chat_error",
      });
      await langfuse?.flushAsync();
    }

    const status = error instanceof HttpError ? error.status : 500;
    const payload: ErrorResponse =
      error instanceof HttpError
        ? { ...error.payload, trace_id: trace?.id ?? null }
        : {
            ok: false,
            error: String(error instanceof Error ? error.message : error || "server_error"),
            trace_id: trace?.id ?? null,
          };

    req.log.error({ err: error }, "chat_error");
    return reply.code(status).send(payload);
  }
}

export function buildNovaApp(opts?: { logger?: boolean }): FastifyInstance {
  const app = Fastify({ logger: opts?.logger ?? true });

  app.get("/health", async () => ({
    ok: true,
    service: "nova.agi.orchestrator",
    fabric_ready: true,
    hocker_one_api_url: config.hockerOneApiUrl,
    provider_ready: providerAvailable("openai") || providerAvailable("gemini"),
    providers: {
      openai: providerAvailable("openai"),
      gemini: providerAvailable("gemini"),
    },
    budgets: {
      enabled: config.budgets.enabled,
      openai_monthly_tokens: config.budgets.openaiMonthlyTokens,
      gemini_monthly_tokens: config.budgets.geminiMonthlyTokens,
    },
    actions: {
      enabled: config.actions.enabled,
      fallback_node_id: config.actions.fallbackNodeId,
      default_node_id: config.actions.defaultNodeId,
    },
    ts: nowIso(),
  }));

  app.post("/chat", handleChat);
  app.post("/v1/chat", handleChat);

  return app;
}