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

const VALID_INTENTS: Intent[] = ["general", "ops", "code", "finance", "social", "research"];

const DECIDE_PROMPT = `
Eres el Router Cognitivo de NOVA AGI.
Clasifica el mensaje del usuario en UNA de estas intenciones exactas:
- "general"
- "ops"
- "code"
- "finance"
- "social"
- "research"

Responde SOLO con JSON válido:
{"intent":"general|ops|code|finance|social|research","reason":"explicación breve"}
`.trim();

function providerAvailable(provider: Provider): boolean {
  if (provider === "ollama") return Boolean(config.ollama.enabled);
  if (provider === "openai") return Boolean(config.openai.apiKey);
  if (provider === "gemini") return Boolean(config.gemini.apiKey);
  return Boolean(config.anthropic.apiKey);
}

function candidateProviders(prefer: Prefer = "auto"): Provider[] {
  const ordered: Provider[] = [];

  const push = (provider: Provider) => {
    if (providerAvailable(provider) && !ordered.includes(provider)) {
      ordered.push(provider);
    }
  };

  if (prefer !== "auto") {
    push(prefer);
  }

  push("anthropic");
  push("openai");
  push("gemini");
  push("ollama");

  return ordered;
}

function heuristicDecision(message: string): Decision {
  const m = message.toLowerCase();

  if (
    /(deploy|infra|server|servidor|cloud|docker|endpoint|api|token|auth|firma|hmac|seguridad|supabase|sql|node|cron|queue|observabilidad)/i.test(
      m,
    )
  ) {
    return {
      intent: "ops",
      reason: "Se detectó lenguaje técnico-operativo.",
    };
  }

  if (
    /(código|codigo|typescript|javascript|bug|debug|repo|función|funcion|schema|arquitectura de software|backend|frontend)/i.test(
      m,
    )
  ) {
    return {
      intent: "code",
      reason: "Se detectó lenguaje de desarrollo.",
    };
  }

  if (/(roi|costos|costo|presupuesto|factura|stripe|mercadopago|finanzas|pago|tokens)/i.test(m)) {
    return {
      intent: "finance",
      reason: "Se detectó intención financiera.",
    };
  }

  if (/(meta ads|tiktok|campaña|campana|copy|lead|crm|whatsapp|social|contenido|anuncio)/i.test(m)) {
    return {
      intent: "social",
      reason: "Se detectó intención de marketing/social.",
    };
  }

  if (/(analiza|investiga|compara|topología|topologia|benchmark|estrategia|probabilidad|research)/i.test(m)) {
    return {
      intent: "research",
      reason: "Se detectó intención analítica.",
    };
  }

  return {
    intent: "general",
    reason: "Consulta general.",
  };
}

function extractDecision(text: string): Decision | null {
  const parsed = parseStableJson(text);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;
  const intent = typeof obj.intent === "string" ? obj.intent.trim() : "";
  const reason = typeof obj.reason === "string" ? obj.reason.trim() : "";

  if (!VALID_INTENTS.includes(intent as Intent)) return null;
  if (!reason) return null;

  return {
    intent: intent as Intent,
    reason,
  };
}

async function completeWith(provider: Provider, messages: ChatMessage[]): Promise<string> {
  const timeoutMs = 12_000;

  if (provider === "openai") {
    const result = await openaiRespond({
      apiKey: config.openai.apiKey,
      model: modelFor("openai", "fast"),
      messages,
      timeoutMs,
    });
    return result.text;
  }

  if (provider === "gemini") {
    const result = await geminiRespond({
      apiKey: config.gemini.apiKey,
      model: modelFor("gemini", "fast"),
      messages,
      timeoutMs,
    });
    return result.text;
  }

  if (provider === "anthropic") {
    const result = await anthropicRespond({
      apiKey: config.anthropic.apiKey,
      model: modelFor("anthropic", "fast"),
      messages,
      timeoutMs,
    });
    return result.text;
  }

  const result = await ollamaRespond({
    baseUrl: config.ollama.baseUrl,
    model: modelFor("ollama", "fast"),
    messages,
    timeoutMs,
  });

  return result.text;
}

export async function decideIntent(message: string, prefer: Prefer = "auto"): Promise<Decision> {
  const heuristic = heuristicDecision(message);

  const providers = candidateProviders(prefer);
  if (!providers.length) {
    return heuristic;
  }

  const messages: ChatMessage[] = [
    { role: "system", content: DECIDE_PROMPT },
    { role: "user", content: message },
  ];

  for (const provider of providers) {
    try {
      const text = await completeWith(provider, messages);
      const parsed = extractDecision(text);
      if (parsed) return parsed;
    } catch {
      // fallback silencioso a heurística o siguiente provider
    }
  }

  return heuristic;
}