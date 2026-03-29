import { config, modelFor } from "../config.js";
import { openaiRespond } from "../providers/openai.js";
import { geminiRespond } from "../providers/gemini.js";
import type { Intent, Prefer } from "../types.js";
import { parseStableJson } from "./stable-json.js";
import { detectIntent } from "./intents.js";

type Decision = {
  intent: Intent;
  reason: string;
};

const DECIDE_PROMPT = `
Eres el Router Cognitivo de NOVA AGI.
Clasifica el mensaje del usuario en UNA de estas intenciones exactas:
- "general" : Preguntas comunes, saludos, charlas abiertas.
- "ops" : Comandos de infraestructura, servidores, nodos, terminal, seguridad Vertx.
- "code" : Creación de software, debugging, arquitectura.
- "finance" : Dinero, Stripe, MercadoPago, ROI, ganancias (Numia).
- "social" : Meta Ads, WhatsApp, TikTok, creación de contenido, CRM.
- "research" : Búsqueda profunda, análisis de mercado, probabilidad (Curvewind/Chido Wins).

REGLA ESTRICTA: Responde SOLO con un objeto JSON válido.
Formato: {"intent": "general|ops|code|finance|social|research", "reason": "Breve explicación en 10 palabras"}
`.trim();

function providerAvailable(provider: "openai" | "gemini"): boolean {
  return Boolean(provider === "openai" ? config.openai.apiKey : config.gemini.apiKey);
}

function candidateProviders(prefer: Prefer): Array<"openai" | "gemini"> {
  const openaiReady = providerAvailable("openai");
  const geminiReady = providerAvailable("gemini");

  if (prefer === "openai") {
    return [
      ...(openaiReady ? ["openai" as const] : []),
      ...(geminiReady ? ["gemini" as const] : []),
    ];
  }

  if (prefer === "gemini") {
    return [
      ...(geminiReady ? ["gemini" as const] : []),
      ...(openaiReady ? ["openai" as const] : []),
    ];
  }

  if (openaiReady) return ["openai", ...(geminiReady ? ["gemini"] : [])];
  if (geminiReady) return ["gemini", ...(openaiReady ? ["openai"] : [])];

  return [];
}

export async function decideIntent(message: string, prefer: Prefer): Promise<Decision> {
  const messages: { role: "system" | "user"; content: string }[] = [
    { role: "system", content: DECIDE_PROMPT },
    { role: "user", content: message },
  ];

  let lastError: unknown = null;

  for (const provider of candidateProviders(prefer)) {
    const apiKey = provider === "openai" ? config.openai.apiKey : config.gemini.apiKey;
    if (!apiKey) continue;

    try {
      const response =
        provider === "openai"
          ? await openaiRespond({
              apiKey,
              model: modelFor("openai", "fast"),
              messages,
              jsonMode: true,
            })
          : await geminiRespond({
              apiKey,
              model: modelFor("gemini", "fast"),
              messages,
              jsonMode: true,
            });

      const obj = parseStableJson(response.text);
      if (obj && typeof obj.intent === "string") {
        const i = obj.intent.toLowerCase();
        if (["general", "ops", "code", "finance", "social", "research"].includes(i)) {
          return { intent: i as Intent, reason: obj.reason || "Decisión estándar" };
        }
      }
    } catch (error) {
      lastError = error;
    }
  }

  const heuristic = detectIntent(message);
  if (heuristic !== "general") {
    return { intent: heuristic, reason: "Fallback_heuristic" };
  }

  if (lastError) {
    console.error("Router Cognitivo Falló:", lastError instanceof Error ? lastError.message : String(lastError));
  }

  return { intent: "general", reason: "Fallback_parse_error" };
}