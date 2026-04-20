import type { Intent } from "../types.js";

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k));
}

export function detectIntent(msg: string): Intent {
  const m = msg.toLowerCase();

  const codeHints = [
    "bug",
    "error",
    "typescript",
    "javascript",
    "sql",
    "supabase",
    "docker",
    "cloud run",
    "rls",
    "api",
    "endpoint",
    "repo",
    "schema",
    "backend",
    "frontend",
    "función",
    "funcion",
    "código",
    "codigo",
  ];
  if (includesAny(m, codeHints)) return "code";

  const opsHints = [
    "deploy",
    "infra",
    "server",
    "servidor",
    "observabilidad",
    "logs",
    "seguridad",
    "audit",
    "backup",
    "token",
    "firma",
    "hmac",
    "nodo",
    "cola",
    "queue",
  ];
  if (includesAny(m, opsHints)) return "ops";

  const financeHints = [
    "stripe",
    "cobro",
    "roi",
    "presupuesto",
    "finanzas",
    "pago",
    "mercadopago",
    "factura",
    "costos",
    "costo",
    "ingresos",
    "ganancia",
  ];
  if (includesAny(m, financeHints)) return "finance";

  const socialHints = [
    "whatsapp",
    "tiktok",
    "meta ads",
    "campaña",
    "campana",
    "crm",
    "leads",
    "ventas",
    "copy",
    "contenido",
    "anuncio",
    "social media",
  ];
  if (includesAny(m, socialHints)) return "social";

  const researchHints = [
    "investiga",
    "research",
    "compara",
    "benchmark",
    "tendencia",
    "mercado",
    "competencia",
    "probabilidad",
    "analiza",
    "análisis",
    "analisis",
    "topología",
    "topologia",
    "arquitectura",
    "estrategia",
  ];
  if (includesAny(m, researchHints)) return "research";

  return "general";
}