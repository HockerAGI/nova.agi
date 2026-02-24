import type { Intent } from "../types.js";

export function detectIntent(msg: string): Intent {
  const m = msg.toLowerCase();

  const codeHints = ["bug", "error", "ts", "typescript", "sql", "supabase", "docker", "cloud run", "rls", "api", "endpoint"];
  if (codeHints.some((k) => m.includes(k))) return "code";

  const opsHints = ["deploy", "infra", "server", "observabilidad", "logs", "seguridad", "audit", "backup"];
  if (opsHints.some((k) => m.includes(k))) return "ops";

  // --- ACTUALIZACIÓN: INTENCIONES AÑADIDAS (Finance & Social) ---
  const financeHints = ["stripe", "cobro", "roi", "presupuesto", "finanzas", "pago", "mercadopago"];
  if (financeHints.some((k) => m.includes(k))) return "finance";

  const socialHints = ["whatsapp", "tiktok", "meta ads", "campaña", "crm", "leads", "ventas"];
  if (socialHints.some((k) => m.includes(k))) return "social";

  const researchHints = ["investiga", "research", "compara", "benchmark", "tendencia", "mercado", "competencia", "probabilidad"];
  if (researchHints.some((k) => m.includes(k))) return "research";

  return "general";
}