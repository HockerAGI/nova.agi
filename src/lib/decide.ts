import { openaiRespond } from "../providers/openai.js";
import { geminiRespond } from "../providers/gemini.js";
import { config, modelFor } from "../config.js";
import type { Prefer, Intent } from "../types.js";
import { parseStableJson } from "./stable-json.js";

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

export async function decideIntent(message: string, prefer: Prefer): Promise<Decision> {
  const messages: { role: "system" | "user"; content: string }[] = [
    { role: "system", content: DECIDE_PROMPT },
    { role: "user", content: message }
  ];

  let text = "";
  
  try {
    // Usamos el modelo 'fast' para decisiones rápidas y baratas
    if (prefer === "openai" || (prefer === "auto" && config.openai.apiKey)) {
      const r = await openaiRespond({
        apiKey: config.openai.apiKey!,
        model: modelFor("openai", "fast"),
        messages,
        jsonMode: true
      });
      text = r.text;
    } else {
      const r = await geminiRespond({
        apiKey: config.gemini.apiKey!,
        model: modelFor("gemini", "fast"),
        messages,
        jsonMode: true
      });
      text = r.text;
    }

    const obj = parseStableJson(text);
    
    if (obj && typeof obj.intent === "string") {
      const i = obj.intent.toLowerCase();
      if (["general", "ops", "code", "finance", "social", "research"].includes(i)) {
        return { intent: i as Intent, reason: obj.reason || "Decisión estándar" };
      }
    }
  } catch (e: any) {
    console.error("Router Cognitivo Falló:", e.message);
  }

  // Fallback seguro a general si el LLM falla o alucina
  return { intent: "general", reason: "Fallback_parse_error" };
}