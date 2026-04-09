import { config, modelFor } from "../config.js";
import { openaiRespond } from "../providers/openai.js";
import { geminiRespond } from "../providers/gemini.js";
import { anthropicRespond } from "../providers/anthropic.js";
import { ollamaRespond } from "../providers/ollama.js";
import type { Intent, Prefer, Provider, ChatMessage } from "../types.js";
import { parseStableJson } from "./stable-json.js";

type Decision = {
  intent: Intent;
  reason: string;
};

const DECIDE_PROMPT = `
Eres el Router Cognitivo de NOVA AGI.
Clasifica el mensaje del usuario en UNA de estas intenciones exactas:
- "general" : Preguntas comunes, saludos, charlas abiertas.
- "ops" : Comandos de infraestructura, servidores, nodos, terminal, seguridad.
- "code" : Creación de software, debugging, arquitectura.
- "finance" : Dinero, Stripe, MercadoPago, ROI, ganancias.
- "social" : Meta Ads, WhatsApp, TikTok, creación de contenido, CRM.
- "research" : Búsqueda profunda, análisis, probabilidad, estrategia.

REGLA ESTRICTA: Responde SOLO con un objeto JSON válido.
Formato: {"intent":"general|ops|code|finance|social|research","reason":"Breve explicación en 10 palabras"}
`.trim();

function providerAvailable(provider: Provider): boolean {
  if (provider === "ollama") return Boolean(config.ollama.enabled);
  return Boolean(
    provider === "openai"
      ? config.openai.apiKey
      : provider === "gemini"
        ? config.gemini.apiKey
        : config.anthropic.apiKey,
  );
}

function candidateProviders(prefer: Prefer): Provider[] {
  const openaiReady = providerAvailable("openai");
  const geminiReady = providerAvailable("gemini");
  const anthropicReady = providerAvailable("anthropic");
  const ollamaReady = providerAvailable("ollama");

  const providers: Provider[] = [];

  const pushIfReady = (provider: Provider) => {
    if (providerAvailable(provider) && !providers.includes(provider)) providers.push(provider);
  };

  if (prefer !== "auto") {
    pushIfReady(prefer);
    pushIfReady("anthropic");
    pushIfReady("openai");
    pushIfReady("gemini");
    pushIfReady("ollama");
    return providers;
  }

  for (const provider of ["anthropic", "openai", "gemini", "ollama"] as Provider[]) {
    if (providerAvailable(provider)) providers.push(provider);
  }

  if (!providers.length) {
    if (anthropicReady) providers.push("anthropic");
    if (openaiReady) providers.push("openai");
    if (geminiReady) providers.push("gemini");
    if (ollamaReady) providers.push("ollama");
  }

  return providers;
}

async function completeWith(provider: Provider, messages: ChatMessage[], jsonMode = true): Promise<string> {
  if (provider === "openai") {
    const result = await openaiRespond({
      apiKey: config.openai.apiKey!,
      model: modelFor("openai", "auto"),
      messages,
      jsonMode,
    });
    return result.text;
  }

  if (provider === "gemini") {
    const result = await geminiRespond({
      apiKey: config.gemini.apiKey!,
      model: modelFor("gemini", "auto"),
      messages,
      jsonMode,
    });
    return result.text;
  }

  if (provider === "anthropic") {
    const result = await anthropicRespond({
      apiKey: config.anthropic.apiKey!,
      model: modelFor("anthropic", "auto"),
      messages,
      jsonMode,
    });
    return result.text;
  }

  const result = await ollamaRespond({
    baseUrl: config.ollama.baseUrl,
    model: modelFor("ollama", "auto"),
    messages,
  });
  return result.text;
}

function extractDecision(text: string): Decision | null {
  const stable = parseStableJson(text);
  const candidate = stable ?? (() => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  })();

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;

  const obj = candidate as Record<string, unknown>;
  const intent = obj.intent;
  const reason = obj.reason;

  const validIntents: Intent[] = ["general", "ops", "code", "finance", "social", "research"];

  if (
    typeof intent === "string" &&
    validIntents.includes(intent as Intent) &&
    typeof reason === "string" &&
    reason.trim().length
  ) {
    return {
      intent: intent as Intent,
      reason: reason.trim(),
    };
  }

  return null;
}

export async function decideIntent(message: string, prefer: Prefer): Promise<Decision> {
  const messages: ChatMessage[] = [
    { role: "system", content: DECIDE_PROMPT },
    { role: "user", content: message },
  ];

  let lastError: unknown = null;

  for (const provider of candidateProviders(prefer)) {
    try {
      const text = await completeWith(provider, messages, true);
      const parsed = extractDecision(text);
      if (parsed) return parsed;
      lastError = new Error(`Respuesta inválida desde ${provider}.`);
    } catch (error: unknown) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error("No se pudo decidir la intención.");
}