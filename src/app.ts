import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { config, modelFor, providerReady } from "./config.js";
import type {
  ActionItem,
  ChatMessage,
  ChatRequest,
  ChatResult,
  CompletionMode,
  Intent,
  JsonObject,
  Provider,
} from "./types.js";
import { createAdminSupabase } from "./lib/supabase.js";
import { ensureThread, appendMessage, loadThreadMessages } from "./lib/memory.js";
import { pickAgi } from "./lib/agis.js";
import { enqueueActions } from "./lib/actions.js";
import { recordUsage, tokensUsedThisMonth } from "./lib/usage.js";
import { openaiRespond } from "./providers/openai.js";
import { geminiRespond } from "./providers/gemini.js";
import { anthropicRespond } from "./providers/anthropic.js";
import { ollamaRespond } from "./providers/ollama.js";

const supabaseAdmin = createAdminSupabase();

const ChatSchema = z
  .object({
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
  })
  .superRefine((value, ctx) => {
    if (!value.message && !value.text) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["message"],
        message: "message o text es obligatorio.",
      });
    }
  });

function pickProvider(prefer: string | undefined): Provider {
  const p = String(prefer ?? "").toLowerCase();

  if (p === "openai" && providerReady("openai")) return "openai";
  if (p === "gemini" && providerReady("gemini")) return "gemini";
  if (p === "anthropic" && providerReady("anthropic")) return "anthropic";
  if (p === "ollama" && providerReady("ollama")) return "ollama";

  if (providerReady("anthropic")) return "anthropic";
  if (providerReady("openai")) return "openai";
  if (providerReady("gemini")) return "gemini";
  return "ollama";
}

function detectIntent(message: string): { intent: Intent; reason: string } {
  const m = message.toLowerCase();

  if (/(infra|server|deploy|cloud|node|docker|endpoint|api|token|seguridad|auth|firma|hmac|sql|supabase)/i.test(m)) {
    return { intent: "ops", reason: "Se detectó lenguaje técnico-operativo." };
  }

  if (/(typescript|javascript|bug|error|debug|repo|código|codigo|función|funcion|schema)/i.test(m)) {
    return { intent: "code", reason: "Se detectó lenguaje de desarrollo." };
  }

  if (/(roi|costos|costo|presupuesto|finanzas|factura|stripe|mercadopago|pago)/i.test(m)) {
    return { intent: "finance", reason: "Se detectó intención financiera." };
  }

  if (/(meta ads|tiktok|campaña|campana|copy|lead|crm|whatsapp|social)/i.test(m)) {
    return { intent: "social", reason: "Se detectó intención de marketing/social." };
  }

  if (/(analiza|investiga|compara|topología|topologia|arquitectura|benchmark|estrategia)/i.test(m)) {
    return { intent: "research", reason: "Se detectó intención analítica." };
  }

  return { intent: "general", reason: "Consulta general." };
}

function providerRole(role: string): "system" | "user" | "assistant" {
  if (role === "system") return "system";
  if (role === "assistant" || role === "nova") return "assistant";
  return "user";
}

function buildConversation(systemPrompt: string, history: ChatMessage[], userMessage: string): ChatMessage[] {
  const recent = history.slice(-12).map((msg) => ({
    role: providerRole(msg.role),
    content: msg.content,
  })) as ChatMessage[];

  return [
    { role: "system", content: systemPrompt },
    ...recent,
    { role: "user", content: userMessage },
  ];
}

function asJsonObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function sanitizeAction(value: unknown): ActionItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.command !== "string" || !row.command.trim()) return null;

  return {
    node_id:
      typeof row.node_id === "string" && row.node_id.trim()
        ? row.node_id.trim()
        : undefined,
    command: row.command.trim(),
    payload: asJsonObject(row.payload),
    needs_approval: Boolean(row.needs_approval),
  };
}

function parseReplyEnvelope(text: string): { reply: string; actions: ActionItem[] } {
  const clean = String(text ?? "").trim();
  if (!clean) return { reply: "Sin respuesta.", actions: [] };

  try {
    const parsed = JSON.parse(clean) as Record<string, unknown>;
    const reply =
      typeof parsed.reply === "string" && parsed.reply.trim()
        ? parsed.reply.trim()
        : clean;

    const actions = Array.isArray(parsed.actions)
      ? parsed.actions.map(sanitizeAction).filter((item): item is ActionItem => Boolean(item))
      : [];

    return { reply, actions };
  } catch {
    // sigue abajo
  }

  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      const parsed = JSON.parse(clean.slice(first, last + 1)) as Record<string, unknown>;
      const reply =
        typeof parsed.reply === "string" && parsed.reply.trim()
          ? parsed.reply.trim()
          : clean;

      const actions = Array.isArray(parsed.actions)
        ? parsed.actions.map(sanitizeAction).filter((item): item is ActionItem => Boolean(item))
        : [];

      return { reply, actions };
    } catch {
      // ignore
    }
  }

  return { reply: clean, actions: [] };
}

async function complete(
  provider: Provider,
  messages: ChatMessage[],
  mode: CompletionMode,
) {
  const timeoutMs = mode === "pro" ? 60_000 : 35_000;

  if (provider === "openai") {
    return openaiRespond({
      apiKey: config.openai.apiKey,
      model: modelFor("openai", mode),
      messages,
      timeoutMs,
    });
  }

  if (provider === "gemini") {
    return geminiRespond({
      apiKey: config.gemini.apiKey,
      model: modelFor("gemini", mode),
      messages,
      timeoutMs,
    });
  }

  if (provider === "anthropic") {
    return anthropicRespond({
      apiKey: config.anthropic.apiKey,
      model: modelFor("anthropic", mode),
      messages,
      timeoutMs,
    });
  }

  return ollamaRespond({
    baseUrl: config.ollama.baseUrl,
    model: modelFor("ollama", mode),
    messages,
    timeoutMs,
  });
}

async function getControls(project_id: string): Promise<{ kill_switch: boolean; allow_write: boolean }> {
  try {
    const { data } = await supabaseAdmin
      .from("system_controls")
      .select("kill_switch,allow_write")
      .eq("project_id", project_id)
      .eq("id", "global")
      .maybeSingle();

    return {
      kill_switch: Boolean((data as { kill_switch?: unknown } | null)?.kill_switch),
      allow_write: Boolean((data as { allow_write?: unknown } | null)?.allow_write),
    };
  } catch {
    return { kill_switch: false, allow_write: false };
  }
}

export async function handleChat(
  request: { body?: unknown },
  reply: { status: (code: number) => { send: (payload: unknown) => unknown } },
) {
  const parsed = ChatSchema.safeParse(request.body ?? {});

  if (!parsed.success) {
    return reply.status(400).send({
      ok: false,
      error: "Payload inválido.",
      issues: parsed.error.flatten(),
    });
  }

  const body = parsed.data as ChatRequest & {
    project_id: string;
    thread_id?: string | null;
    prefer: Provider | "auto";
    mode: CompletionMode;
    allow_actions: boolean;
    context_data?: JsonObject | null;
  };

  const project_id = body.project_id.trim();
  const message = String(body.message ?? body.text ?? "").trim();
  const provider = pickProvider(body.prefer);
  const trace_id = randomUUID();
  const controls = await getControls(project_id);

  if (controls.kill_switch) {
    return reply.status(423).send({
      ok: false,
      error: "Kill switch activo. Escritura e inferencia pausadas.",
      trace_id,
    });
  }

  if (!providerReady(provider)) {
    return reply.status(503).send({
      ok: false,
      error: `No hay proveedor disponible para "${provider}".`,
      trace_id,
    });
  }

  const intentDecision = detectIntent(message);
  const agi = pickAgi(intentDecision.intent, message);

  const thread = await ensureThread(
    supabaseAdmin,
    project_id,
    body.thread_id ?? null,
    body.user_id ?? null,
    message.slice(0, 120),
  );

  const history = await loadThreadMessages(supabaseAdmin, thread.id, project_id, 20);

  await appendMessage(supabaseAdmin, thread.id, project_id, "user", message, {
    trace_id,
    intent: intentDecision.intent,
    agi_id: agi.id,
    context_data: body.context_data ?? {},
  });

  const monthlyTokens = await tokensUsedThisMonth(project_id, provider);

  const systemPrompt = [
    agi.system_prompt,
    `Proyecto activo: ${project_id}.`,
    `Intención clasificada: ${intentDecision.intent}.`,
    `Consumo mensual estimado para ${provider}: ${monthlyTokens} tokens.`,
    "Responde con claridad ejecutiva, criterio técnico y sin inventar estado del sistema.",
    "Si no tienes evidencia suficiente, dilo directo.",
    "Si el usuario pide ejecución y allow_actions=true, puedes devolver JSON con reply y actions.",
  ].join("\n");

  const completion = await complete(
    provider,
    buildConversation(systemPrompt, history, message),
    body.mode,
  );

  const parsedReply = parseReplyEnvelope(completion.text);
  const replyText = parsedReply.reply || "Sin respuesta.";

  let enqueuedActions: ActionItem[] = [];

  if (body.allow_actions && controls.allow_write && parsedReply.actions.length > 0) {
    const rows = await enqueueActions(supabaseAdmin, {
      project_id,
      thread_id: thread.id,
      node_id: null,
      actions: parsedReply.actions,
      needsApproval: false,
    });

    enqueuedActions = rows.map((row) => ({
      node_id: row.node_id ?? undefined,
      command: row.command,
      payload: row.payload,
      needs_approval: row.needs_approval,
    }));
  }

  await appendMessage(supabaseAdmin, thread.id, project_id, "assistant", replyText, {
    trace_id,
    provider,
    model: completion.model,
    intent: intentDecision.intent,
    agi_id: agi.id,
    actions_enqueued: enqueuedActions.length,
  });

  await recordUsage({
    project_id,
    thread_id: thread.id,
    provider,
    model: completion.model,
    tokens_in: completion.usage?.tokens_in,
    tokens_out: completion.usage?.tokens_out,
    trace_id,
    meta: {
      agi_id: agi.id,
      intent: intentDecision.intent,
    },
  });

  const payload: ChatResult = {
    ok: true,
    project_id,
    thread_id: thread.id,
    provider,
    model: completion.model,
    intent: intentDecision.intent,
    agi_id: agi.id,
    reply: replyText,
    actions: enqueuedActions,
    trace_id,
    meta: {
      reason: intentDecision.reason,
      controls: {
        allow_write: controls.allow_write,
        requested_actions: body.allow_actions,
        enqueued_actions: enqueuedActions.length,
      },
      context_data: body.context_data ?? {},
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