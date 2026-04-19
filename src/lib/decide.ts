import type { Intent } from "../types.js";

export type Decision = {
  intent: Intent;
  reason: string;
};

const RULES: Array<{ intent: Intent; terms: string[]; reason: string }> = [
  {
    intent: "finance",
    terms: ["roi", "presupuesto", "costo", "factura", "stripe", "mercadopago", "tokens"],
    reason: "Se detectó lenguaje financiero o de costos.",
  },
  {
    intent: "social",
    terms: ["meta ads", "tiktok", "campaña", "copy", "lead", "crm", "whatsapp"],
    reason: "Se detectó lenguaje de marketing o social media.",
  },
  {
    intent: "ops",
    terms: ["seguridad", "permiso", "firma", "hmac", "deploy", "cron", "observabilidad", "nodo"],
    reason: "Se detectó lenguaje operativo o de seguridad.",
  },
  {
    intent: "code",
    terms: ["typescript", "ts", "sql", "bug", "error", "endpoint", "api", "schema", "repo"],
    reason: "Se detectó lenguaje de desarrollo o debugging.",
  },
  {
    intent: "research",
    terms: ["analiza", "compara", "benchmark", "investiga", "arquitectura", "estrategia", "topología"],
    reason: "Se detectó lenguaje analítico o de investigación.",
  },
];

export async function decideIntent(message: string): Promise<Decision> {
  const m = message.toLowerCase();
  for (const rule of RULES) {
    if (rule.terms.some((term) => m.includes(term))) {
      return { intent: rule.intent, reason: rule.reason };
    }
  }
  return { intent: "general", reason: "No se detectó una categoría especializada dominante." };
}