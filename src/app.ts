import "dotenv/config";
import crypto from "node:crypto";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { Langfuse } from "langfuse-node";

import { config } from "./config.js";
import { requireAuth, HttpError } from "./lib/http.js";
import { detectIntent } from "./lib/intents.js";
import { pickAgi } from "./lib/agis.js";
import { ensureThread, loadThread, appendMessage, toChatRole } from "./lib/memory.js";
import { openaiRespond } from "./providers/openai.js";
import { geminiRespond } from "./providers/gemini.js";
import { anthropicRespond } from "./providers/anthropic.js";
import { ollamaRespond } from "./providers/ollama.js";
import { enqueueActions } from "./lib/actions.js";
import { recordUsage, tokensUsedThisMonth } from "./lib/usage.js";
import { parseStableJson } from "./lib/stable-json.js";

type Intent =
  | "general"
  | "code"
  | "ops"
  | "research"
  | "finance"
  | "social";

type Provider = "openai" | "gemini" | "anthropic" | "ollama";
type CompletionMode = "auto" | "fast" | "pro";
type Prefer = Provider | "auto";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

type Action = {
  node_id?: string;
  command: string;
  payload?: JsonObject;
};

type ChatRequestBody = {
  project_id?: string;
  thread_id?: string | null;
  message?: string;
  text?: string;
  prefer?: string;
  mode?: string;
  allow_actions?: boolean;
  user_id?: string | null;
  user_email?: string | null;
  context_data?: JsonObject | null;
};

type ChatHeaders = {
  authorization?: string;
  "x-allow-actions"?: string;
};

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
};

type CompletionResult = {
  provider: Provider;
  model: string;
  text: string;
  usage?: { tokens_in?: number; tokens_out?: number };
  fallbackUsed: boolean;
};

type ChatResponse = {
  ok: true;
  project_id: string;
  thread_id: string;
  provider: Provider;
  model: string;
  intent: Intent;
  agi_id: string;
  reply: string;
  trace_id: string | null;
  actions: Action[];
  meta: JsonObject;
};

type ErrorResponse = {
  ok: false;
  error: string;
  trace_id: string | null;
  details?: string;
};

type LangfuseTraceLike = {
  id?: string;
  event: (args: Record<string, unknown>) => void;
  update: (args: Record<string, unknown>) => void;
  generation: (args: Record<string, unknown>) => {
    end: (args: {
      output: string;
      usage?: {
        promptTokens?: number;
        completionTokens?: number;
      };
    }) => void;
  };
};

function createLangfuseClient(): Langfuse | null {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = process.env.LANGFUSE_SECRET_KEY?.trim();
  const baseUrl = process.env.LANGFUSE_BASE_URL?.trim() || "https://cloud.langfuse.com";

  if (!publicKey || !secretKey) return null;

  try {
    return new Langfuse({
      publicKey,
      secretKey,
      baseUrl,
    });
  } catch (error) {
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
  if (s === "openai" || s === "gemini" || s === "anthropic" || s === "ollama" || s === "auto") {
    return s as Prefer;
  }
  return "auto";
}

function normalizeMode(value: unknown): CompletionMode {
  const s = String(value ?? "auto").trim().toLowerCase();
  if (s === "fast" || s === "pro" || s === "auto") return s;
  return "auto";
}

function providerAvailable(provider: Provider): boolean {
  if (provider === "openai") return Boolean(process.env.OPENAI_API_KEY?.trim());
  if (provider === "gemini") return Boolean(process.env.GEMINI_API_KEY?.trim());
  if (provider === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  return String(process.env.OLLAMA_ENABLED ?? "1").trim() !== "0";
}

function resolveModel(provider: Provider, mode: CompletionMode): string {
  if (provider === "openai") {
    if (mode === "fast") return process.env.OPENAI_MODEL_FAST?.trim() || "gpt-4o-mini";
    if (mode === "pro") return process.env.OPENAI_MODEL_PRO?.trim() || "gpt-4.1";
    return process.env.OPENAI_MODEL?.trim() || "gpt-4o";
  }

  if (provider === "gemini") {
    if (mode === "fast") return process.env.GEMINI_MODEL_FAST?.trim() || "gemini-2.0-flash-lite";
    if (mode === "pro") return process.env.GEMINI_MODEL_PRO?.trim() || "gemini-2.5-pro";
    return process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
  }

  if (provider === "anthropic") {
    if (mode === "fast") return process.env.ANTHROPIC_MODEL_FAST?.trim() || "claude-haiku-4-5";
    if (mode === "pro") return process.env.ANTHROPIC_MODEL_PRO?.trim() || "claude-opus-4-5";
    return process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-5";
  }

  if (mode === "fast") return process.env.OLLAMA_MODEL_FAST?.trim() || "llama3:8b";
  if (mode === "pro") return process.env.OLLAMA_MODEL_PRO?.trim() || "llama3.1:70b";
  return process.env.OLLAMA_MODEL?.trim() || "llama3:8b";
}

function pickProvider(intent: Intent, prefer: Prefer): Provider {
  const preferredCandidates: Provider[] =
    prefer === "openai"
      ? ["openai", "anthropic", "gemini", "ollama"]
      : prefer === "gemini"
        ? ["gemini", "anthropic", "openai", "ollama"]
        : prefer === "anthropic"
          ? ["anthropic", "openai", "gemini", "ollama"]
          : prefer === "ollama"
            ? ["ollama", "anthropic", "openai", "gemini"]
            : intent === "code" || intent === "ops" || intent === "research"
              ? ["anthropic", "openai", "gemini", "ollama"]
              : intent === "social"
                ? ["gemini", "anthropic", "openai", "ollama"]
                : intent === "finance"
                  ? ["anthropic", "openai", "gemini", "ollama"]
                  : ["anthropic", "gemini", "openai", "ollama"];

  for (const provider of preferredCandidates) {
    if (providerAvailable(provider)) return provider;
  }

  return "ollama";
}

function extractTextFromJsonReply(text: string): { reply: string; actions: Action[]; meta: JsonObject } {
  const parsed = parseStableJson(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { reply: text.trim(), actions: [], meta: {} };
  }

  const obj = parsed as Record<string, unknown>;
  const reply = typeof obj.reply === "string"
    ? obj.reply.trim()
    : typeof obj.response === "string"
      ? obj.response.trim()
      : text.trim();

  const actions = Array.isArray(obj.actions)
    ? (obj.actions as Action[]).filter((action) => {
        return !!action && typeof action === "object" && typeof action.command === "string";
      })
    : [];

  const meta =
    obj.meta && typeof obj.meta === "object" && !Array.isArray(obj.meta)
      ? (obj.meta as JsonObject)
      : {};

  return { reply, actions, meta };
}

async function runCompletionWithFallback(args: {
  provider: Provider;
  mode: CompletionMode;
  messages: ChatMessage[];
  jsonMode: boolean;
}): Promise<CompletionResult> {
  const candidates: Provider[] =
    args.provider === "openai"
      ? ["openai", "anthropic", "gemini", "ollama"]
      : args.provider === "gemini"
        ? ["gemini", "anthropic", "openai", "ollama"]
        : args.provider === "anthropic"
          ? ["anthropic", "openai", "gemini", "ollama"]
          : ["ollama", "anthropic", "openai", "gemini"];

  let lastError: unknown = null;

  for (const provider of candidates) {
    try {
      if (!providerAvailable(provider)) continue;

      const model = resolveModel(provider, args.mode);

      if (provider === "openai") {
        const result = await openaiRespond({
          apiKey: process.env.OPENAI_API_KEY!.trim(),
          model,
          messages: args.messages,
          jsonMode: args.jsonMode,
        });

        return {
          provider,
          model,
          text: result.text,
          usage: result.usage,
          fallbackUsed: provider !== args.provider,
        };
      }

      if (provider === "gemini") {
        const result = await geminiRespond({
          apiKey: process.env.GEMINI_API_KEY!.trim(),
          model,
          messages: args.messages,
          jsonMode: args.jsonMode,
        });

        return {
          provider,
          model,
          text: result.text,
          usage: result.usage,
          fallbackUsed: provider !== args.provider,
        };
      }

      if (provider === "anthropic") {
        const result = await anthropicRespond({
          apiKey: process.env.ANTHROPIC_API_KEY!.trim(),
          model,
          messages: args.messages,
          jsonMode: args.jsonMode,
        });

        return {
          provider,
          model,
          text: result.text,
          usage: result.usage,
          fallbackUsed: provider !== args.provider,
        };
      }

      const result = await ollamaRespond({
        model,
        messages: args.messages,
      });

      return {
        provider: "ollama",
        model,
        text: result.text,
        usage: undefined,
        fallbackUsed: provider !== args.provider,
      };
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

async function routeIntent(message: string, prefer: Prefer): Promise<{ intent: Intent; provider: Provider; model: string; reason: string }> {
  const decision = await Promise.resolve({
    intent: detectIntent(message),
    reason: "Clasificación local del mensaje.",
  });

  const provider = pickProvider(decision.intent, prefer);
  const model = resolveModel(provider, "auto");

  return {
    intent: decision.intent,
    provider,
    model,
    reason: decision.reason,
  };
}

async function buildMessages(args: {
  agiPrompt: string;
  history: ChatMessage[];
  userMessage: string;
  context_data?: JsonObject | null;
}): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: args.agiPrompt,
    },
  ];

  if (args.context_data && Object.keys(args.context_data).length > 0) {
    messages.push({
      role: "system",
      content: `Contexto de trabajo:\n${JSON.stringify(args.context_data, null, 2)}`,
    });
  }

  for (const item of args.history) {
    messages.push({
      role: item.role,
      content: item.content,
      name: item.name,
    });
  }

  if (args.userMessage.trim()) {
    messages.push({
      role: "user",
      content: args.userMessage.trim(),
    });
  }

  return messages;
}

export async function handleChat(
  req: FastifyRequest<{ Body: ChatRequestBody; Headers: ChatHeaders }>,
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

    const allow_actions = Boolean(body.allow_actions) || allowActionsHeader === "1";

    trace = langfuse
      ? (langfuse.trace({
          name: "NOVA_Decision_Matrix",
          sessionId: thread_id,
          userId: user_id || "anonymous",
          metadata: { project_id, mode, allow_actions, prefer },
        }) as unknown as LangfuseTraceLike)
      : null;

    await ensureThread({ project_id, thread_id });
    await appendMessage(project_id, thread_id, "user", message);

    const history = await loadThread(project_id, thread_id, 32);
    const route = await routeIntent(message, prefer);
    const agi = pickAgi(route.intent, message);

    const completionMessages = await buildMessages({
      agiPrompt: agi.system_prompt,
      history: history.map((item) => ({
        role: toChatRole(item.role),
        content: item.content,
      })),
      userMessage: message,
      context_data: body.context_data ?? null,
    });

    const completion = await runCompletionWithFallback({
      provider: route.provider,
      mode,
      messages: completionMessages,
      jsonMode: false,
    });

    let replyText = completion.text.trim() || "Silencio en la red.";
    let plannedActions: Action[] = [];
    let responseMeta: JsonObject = {
      project_id,
      thread_id,
      provider_reason: route.reason,
      agi_kind: agi.kind,
      agi_level: agi.level,
    };

    const extracted = extractTextFromJsonReply(replyText);
    if (extracted.reply || extracted.actions.length > 0 || Object.keys(extracted.meta).length > 0) {
      if (extracted.reply) replyText = extracted.reply;
      plannedActions = extracted.actions;
      responseMeta = { ...responseMeta, ...extracted.meta };
    }

    const actionResult = await enqueueActions({
      project_id,
      allow_actions,
      allow_actions_header: allowActionsHeader,
      actions: plannedActions as any[],
    });

    await appendMessage(project_id, thread_id, "assistant", replyText);

    if (completion.usage) {
      await recordUsage({
        project_id,
        thread_id,
        provider: completion.provider as any,
        model: completion.model,
        tokens_in: completion.usage.tokens_in,
        tokens_out: completion.usage.tokens_out,
        meta: {
          agi_id: agi.id,
          intent: route.intent,
          fallback_used: completion.fallbackUsed,
        },
        trace_id: trace?.id,
      });
    }

    const monthlyTokens = await tokensUsedThisMonth(project_id, completion.provider as any);
    responseMeta.monthly_tokens = monthlyTokens as unknown as JsonValue;

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
    hocker_one_api_url: process.env.HOCKER_ONE_API_URL ?? null,
    provider_ready:
      providerAvailable("openai") ||
      providerAvailable("gemini") ||
      providerAvailable("anthropic") ||
      providerAvailable("ollama"),
    providers: {
      openai: providerAvailable("openai"),
      gemini: providerAvailable("gemini"),
      anthropic: providerAvailable("anthropic"),
      ollama: providerAvailable("ollama"),
    },
    budgets: {
      enabled: String(process.env.BUDGETS_ENABLED ?? "0").trim() === "1",
      openai_monthly_tokens: Number(process.env.BUDGET_OPENAI_TOKENS ?? 250000),
      gemini_monthly_tokens: Number(process.env.BUDGET_GEMINI_TOKENS ?? 250000),
    },
    actions: {
      enabled: String(process.env.ACTIONS_ENABLED ?? "0").trim() === "1",
      fallback_node_id: process.env.FALLBACK_NODE_ID?.trim() ?? "hocker-fabric",
      default_node_id: process.env.DEFAULT_NODE_ID?.trim() ?? "hocker-node-1",
    },
    ts: nowIso(),
  }));

  app.post("/chat", handleChat);
  app.post("/v1/chat", handleChat);

  return app;
}

export default buildNovaApp;