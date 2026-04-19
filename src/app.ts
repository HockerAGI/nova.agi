import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";

import { config, modelFor, providerReady } from "./config.js";
import type { ActionItem, ChatMessage, ChatRequest, ChatResult, CompletionMode, JsonObject, Provider } from "./types.js";
import { decideIntent } from "./lib/decide.js";
import { pickAgi } from "./lib/agis.js";
import { appendMessage, ensureThread, loadThreadMessages } from "./lib/memory.js";
import { sbAdmin } from "./lib/supabase.js";
import { signCommand } from "./lib/security.js";
import { recordUsage, tokensUsedThisMonth } from "./lib/usage.js";
import { parseStableJson } from "./lib/stable-json.js";
import { openaiRespond } from "./providers/openai.js";
import { geminiRespond } from "./providers/gemini.js";
import { anthropicRespond } from "./providers/anthropic.js";
import { ollamaRespond } from "./providers/ollama.js";

const ChatSchema = z.object({
  project_id: z.string().min(1).default("hocker-one"),
  thread_id: z.string().uuid().nullable().optional(),
  message: z.string().min(1).optional(),
  text: z.string().min(1).optional(),
  user_id: z.string().nullable().optional(),
  user_email: z.string().email().nullable().optional(),
  prefer: z.enum(["auto", "openai", "gemini", "anthropic", "ollama"]).default("auto"),
  mode: z.enum(["auto", "fast", "pro"]).default("auto"),
  allow_actions: z.boolean().default(false),
  context_data: z.record(z.unknown()).nullable().optional(),
}).superRefine((value, ctx) => {
  if (!value.message && !value.text) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["message"],
      message: "message o text es obligatorio.",
    });
  }
});

function normalizeContextData(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function pickProvider(prefer: Provider | "auto"): Provider {
  if (prefer !== "auto" && providerReady(prefer)) return prefer;
  if (providerReady("anthropic")) return "anthropic";
  if (providerReady("openai")) return "openai";
  if (providerReady("gemini")) return "gemini";
  return "ollama";
}

function buildConversation(systemPrompt: string, history: ChatMessage[], userMessage: string): ChatMessage[] {
  const clippedHistory = history.slice(-12);
  return [{ role: "system", content: systemPrompt }, ...clippedHistory, { role: "user", content: userMessage }];
}

async function complete(
  provider: Provider,
  messages: ChatMessage[],
  mode: CompletionMode,
) {
  const timeoutMs = mode === "pro" ? 60_000 : 35_000;

  if (provider === "openai") {
    return openaiRespond({ apiKey: config.openai.apiKey, model: modelFor("openai", mode), messages, timeoutMs });
  }
  if (provider === "gemini") {
    return geminiRespond({ apiKey: config.gemini.apiKey, model: modelFor("gemini", mode), messages, timeoutMs });
  }
  if (provider === "anthropic") {
    return anthropicRespond({ apiKey: config.anthropic.apiKey, model: modelFor("anthropic", mode), messages, timeoutMs });
  }
  return ollamaRespond({ baseUrl: config.ollama.baseUrl, model: modelFor("ollama", mode), messages, timeoutMs });
}

async function getControls(project_id: string) {
  const { data } = await sbAdmin()
    .from("system_controls")
    .select("id,project_id,kill_switch,allow_write,meta,created_at,updated_at")
    .eq("project_id", project_id)
    .eq("id", "global")
    .maybeSingle();

  return {
    kill_switch: Boolean((data as { kill_switch?: unknown } | null)?.kill_switch),
    allow_write: Boolean((data as { allow_write?: unknown } | null)?.allow_write),
  };
}

function parseActions(raw: string): { reply: string; actions: ActionItem[] } {
  const parsed = parseStableJson(raw);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const data = parsed as Record<string, unknown>;
    const reply = typeof data.reply === "string" ? data.reply : raw;
    const actions = Array.isArray(data.actions)
      ? data.actions.filter((item): item is ActionItem => {
          return !!item && typeof item === "object" && typeof (item as { command?: unknown }).command === "string";
        })
      : [];
    return { reply, actions };
  }
  return { reply: raw, actions: [] };
}

async function enqueueCommands(project_id: string, actions: ActionItem[]): Promise<ActionItem[]> {
  if (!actions.length) return [];

  const secret = String(process.env.HOCKER_COMMAND_HMAC_SECRET ?? process.env.COMMAND_HMAC_SECRET ?? "").trim();
  if (!secret) return [];

  const now = new Date().toISOString();
  const insertRows = actions.map((action) => {
    const id = randomUUID();
    const node_id = String(action.node_id ?? process.env.DEFAULT_COMMAND_NODE_ID ?? "hocker-node-1").trim();
    const payload = action.payload ?? {};
    const signature = signCommand(secret, id, project_id, node_id, action.command, payload, now);

    return {
      id,
      project_id,
      node_id,
      command: action.command,
      payload,
      status: action.needs_approval ? "needs_approval" : "queued",
      needs_approval: Boolean(action.needs_approval),
      signature,
      created_at: now,
    };
  });

  const { error } = await sbAdmin().from("commands").insert(insertRows);
  if (error) throw new Error(error.message);

  return actions;
}

export async function handleChat(request: { body?: unknown }, reply: { status: (code: number) => { send: (payload: unknown) => unknown } }) {
  const parsed = ChatSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    return reply.status(400).send({ ok: false, error: "Payload inválido.", issues: parsed.error.flatten() });
  }

  const body = parsed.data as ChatRequest & {
    project_id: string;
    thread_id?: string | null;
    prefer: Provider | "auto";
    mode: CompletionMode;
    allow_actions: boolean;
  };

  const message = String(body.message ?? body.text ?? "").trim();
  const project_id = body.project_id.trim();
  const trace_id = randomUUID();

  const controls = await getControls(project_id);
  if (controls.kill_switch) {
    return reply.status(423).send({ ok: false, error: "Kill switch activo. Escritura e inferencia pausadas.", trace_id });
  }

  const provider = pickProvider(body.prefer);
  const intentDecision = await decideIntent(message);
  const agi = pickAgi(intentDecision.intent, message);
  const thread = await ensureThread(sbAdmin(), project_id, body.thread_id, body.user_id ?? null, message.slice(0, 120));
  const historyRows = await loadThreadMessages(sbAdmin(), thread.id, project_id, 24);

  const history: ChatMessage[] = historyRows.map((row) => ({ role: row.role, content: row.content }));
  const contextData = normalizeContextData(body.context_data);

  await appendMessage(sbAdmin(), thread.id, project_id, "user", message, {
    trace_id,
    intent: intentDecision.intent,
    agi_id: agi.key,
    context_data: contextData,
  });

  const budgetUsed = await tokensUsedThisMonth(project_id, provider);
  const systemPrompt = [
    agi.system_prompt,
    `Proyecto activo: ${project_id}.`,
    `Intento clasificado: ${intentDecision.intent}.`,
    `Uso mensual acumulado para ${provider}: ${budgetUsed} tokens.`,
    "Si el usuario pide ejecución y allow_actions=true, puedes responder con JSON {'reply':'...','actions':[...]}.",
    "No inventes estado del servidor, tablas o despliegues que no hayan sido confirmados.",
  ].join("\n");

  const completion = await complete(provider, buildConversation(systemPrompt, history, message), body.mode);
  const parsedOutput = parseActions(completion.text || "");
  const canWrite = body.allow_actions && controls.allow_write;
  const actions = canWrite ? await enqueueCommands(project_id, parsedOutput.actions) : [];

  await appendMessage(sbAdmin(), thread.id, project_id, "assistant", parsedOutput.reply || "Sin respuesta.", {
    trace_id,
    provider,
    model: completion.model,
    intent: intentDecision.intent,
    agi_id: agi.key,
    actions_enqueued: actions.length,
  });

  await recordUsage({
    project_id,
    thread_id: thread.id,
    provider,
    model: completion.model,
    tokens_in: completion.usage?.tokens_in,
    tokens_out: completion.usage?.tokens_out,
    meta: { agi_id: agi.key, intent: intentDecision.intent },
    trace_id,
  });

  const payload: ChatResult = {
    ok: true,
    project_id,
    thread_id: thread.id,
    provider,
    model: completion.model,
    intent: intentDecision.intent,
    agi_id: agi.key,
    reply: parsedOutput.reply || "Sin respuesta.",
    actions,
    trace_id,
    meta: {
      reason: intentDecision.reason,
      controls: {
        allow_write: controls.allow_write,
        requested_actions: body.allow_actions,
        enqueued_actions: actions.length,
      },
    },
  };

  return reply.status(200).send(payload);
}

export function buildNovaApp() {
  const app = Fastify({ logger: true });

  void app.register(cors, {
    origin: true,
  });

  app.addHook("preHandler", async (req, reply) => {
    if (req.method === "GET" && req.url.startsWith("/health")) return;

    if (!config.orchestratorKey) return;
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${config.orchestratorKey}`) {
      return reply.code(401).send({ ok: false, error: "Unauthorized" });
    }
  });

  app.get("/health", async () => ({
    ok: true,
    service: "nova.agi",
    ts: new Date().toISOString(),
  }));

  app.post("/chat", handleChat);
  app.post("/api/chat", handleChat);
  app.post("/api/v1/chat", handleChat);
  app.post("/api/v1/nova/interact", handleChat);

  return app;
}

export async function startServer() {
  const app = buildNovaApp();
  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`[NOVA AGI] listening on ${config.port}`);
}