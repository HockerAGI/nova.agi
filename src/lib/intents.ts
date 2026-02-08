import type { Intent } from "../types.js";

export function detectIntent(msg: string): Intent {
  const m = msg.toLowerCase();

  const codeHints = ["bug", "error", "ts", "typescript", "sql", "supabase", "docker", "cloud run", "rls", "api", "endpoint"];
  if (codeHints.some((k) => m.includes(k))) return "code";

  const researchHints = ["investiga", "research", "compara", "benchmark", "tendencia", "mercado", "competencia"];
  if (researchHints.some((k) => m.includes(k))) return "research";

  const opsHints = ["deploy", "infra", "server", "observabilidad", "logs", "seguridad", "audit", "backup"];
  if (opsHints.some((k) => m.includes(k))) return "ops";

  return "general";
}