import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { config, modelFor, providerReady } from "./config.js";
import type {
  ChatMessage,
  ChatRequest,
  ChatResult,
  CompletionMode,
  Intent,
  Provider,
} from "./types.js";
import { createAdminSupabase } from "./lib/supabase.js";
import { ensureThread, appendMessage, loadThreadMessages } from "./lib/memory.js";
import { pickAgi } from "./lib/agis.js";
import { openaiRespond } from "./providers/openai.js";
import { geminiRespond } from "./providers/gemini.js";
import { anthropicRespond } from "./providers/anthropic.js";
import { ollamaRespond } from "./providers/ollama.js";

const supabaseAdmin = createAdminSupabase();

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
}).superRefine((value, ctx) => {
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

function safeParseReply(text: string): { reply: string } {
  const clean = String(text ?? "").trim();
  if (!clean) return { reply: "Sin respuesta." };

  try {
    const parsed = JSON.parse(clean) as Record<string, unknown>;
    if (typeof parsed.reply === "string" && parsed.reply.trim()) {
      return { reply: parsed.reply.trim() };
    }
  } catch {
    // ignore
  }

  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      const parsed = JSON.parse(clean.slice(first, last + 1)) as Record<string, unknown>;
      if (typeof parsed.reply === "string" && parsed.reply.trim()) {
        return { reply: parsed.reply.trim() };
      }
    } catch {
      // ignore
    }
  }

  return { reply: clean };
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

export async function handleChat(request: { body?: unknown }, reply: { status: (code: number) => { send: (payload: unknown) => unknown } }) {
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
  };

  const project_id = body.project_id.trim();
  const message = String(body.message ?? body.text ?? "").trim();
  const provider = pickProvider(body.prefer);
  const trace_id = randomUUID();

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

  await appendMessage(supabaseAdmin, thread.id, project_id, "user", message);

  const systemPrompt = [
    agi.system_prompt,
    `Proyecto activo: ${project_id}.`,
    `Intención clasificada: ${intentDecision.intent}.`,
    "Responde con claridad ejecutiva, criterio técnico y sin inventar estado del sistema.",
    "Si no tienes evidencia suficiente, dilo directo.",
  ].join("\n");

  const completion = await complete(
    provider,
    buildConversation(systemPrompt, history, message),
    body.mode,
  );

  const parsedReply = safeParseReply(completion.text);
  const replyText = parsedReply.reply || "Sin respuesta.";

  await appendMessage(supabaseAdmin, thread.id, project_id, "assistant", replyText);

  const payload: ChatResult = {
    ok: true,
    project_id,
    thread_id: thread.id,
    provider,
    model: completion.model,
    intent: intentDecision.intent,
    agi_id: agi.id,
    reply: replyText,
    actions: [],
    trace_id,
    meta: {
      reason: intentDecision.reason,
      allow_actions_requested: body.allow_actions,
      actions_enqueued: 0,
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