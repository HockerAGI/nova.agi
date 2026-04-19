import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { config, modelFor, providerReady } from "./config.js";
import type { ChatRequest, ChatResult, Provider } from "./types.js";
import { decideIntent } from "./lib/decide.js";
import { openaiRespond } from "./providers/openai.js";
import { geminiRespond } from "./providers/gemini.js";
import { anthropicRespond } from "./providers/anthropic.js";
import { ollamaRespond } from "./providers/ollama.js";
import { parseStableJson } from "./lib/stable-json.js";

const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function pickProvider(prefer: string | undefined): Provider {
  const p = String(prefer ?? "").toLowerCase();
  if (p === "openai" || p === "gemini" || p === "anthropic" || p === "ollama") return p;
  if (providerReady("anthropic")) return "anthropic";
  if (providerReady("openai")) return "openai";
  if (providerReady("gemini")) return "gemini";
  return "ollama";
}

async function complete(provider: Provider, messages: Array<{ role: "system" | "user" | "assistant"; content: string }>, mode: "auto" | "fast" | "pro") {
  const timeoutMs = mode === "pro" ? 60000 : 35000;

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

export async function handleChat(request: any, reply: any) {
  const body = (request.body ?? {}) as ChatRequest;

  const project_id = String(body.project_id ?? "hocker-one").trim();
  const thread_id = String(body.thread_id ?? randomUUID()).trim();
  const message = String(body.message ?? body.text ?? "").trim();
  const prefer = String(body.prefer ?? "auto").trim();
  const mode = String(body.mode ?? "auto").trim() as "auto" | "fast" | "pro";

  if (!message) {
    return reply.status(400).send({ ok: false, error: "message es obligatorio." });
  }

  const intentDecision = await decideIntent(message, prefer === "auto" ? "auto" : (prefer as any));
  const provider = pickProvider(prefer);

  try {
    await supabaseAdmin.from("nova_messages").insert({
      project_id,
      thread_id,
      role: "user",
      content: message,
      meta: {
        prefer,
        mode,
        intent: intentDecision.intent,
      },
    });
  } catch {}

  const systemPrompt =
    "Eres NOVA, la IA central de HOCKER. Responde clara, ejecutiva, visual y accionable. " +
    "No hables como motor interno: habla como product manager premium con criterio.";

  const completion = await complete(
    provider,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ],
    mode,
  );

  const parsedReply = parseStableJson(completion.text);
  const replyText =
    typeof parsedReply === "object" && parsedReply && !Array.isArray(parsedReply) && typeof (parsedReply as Record<string, unknown>).reply === "string"
      ? String((parsedReply as Record<string, unknown>).reply)
      : completion.text || "Sin respuesta.";

  try {
    await supabaseAdmin.from("nova_messages").insert({
      project_id,
      thread_id,
      role: "assistant",
      content: replyText,
      meta: {
        provider,
        model: completion.model,
        intent: intentDecision.intent,
      },
    });
  } catch {}

  const payload: ChatResult = {
    ok: true,
    project_id,
    thread_id,
    provider,
    model: completion.model,
    intent: intentDecision.intent,
    agi_id: "NOVA",
    reply: replyText,
    actions: [],
    trace_id: null,
    meta: {
      reason: intentDecision.reason,
    },
  };

  return reply.status(200).send(payload);
}

export function buildNovaApp() {
  const app = Fastify({ logger: true });

  void app.register(cors, { origin: "*" });

  app.get("/health", async () => ({
    ok: true,
    service: "nova.agi",
    ts: new Date().toISOString(),
  }));

  app.post("/chat", handleChat);
  app.post("/api/chat", handleChat);
  app.post("/api/v1/chat", handleChat);

  return app;
}

export async function startServer() {
  const app = buildNovaApp();
  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`[NOVA AGI] listening on ${config.port}`);
}