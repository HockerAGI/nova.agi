import { config, modelFor } from "../config.js";
import type { Intent, Mode, Prefer, Provider } from "../types.js";
import { tokensUsedThisMonth } from "./usage.js";

function normMode(v: any): Mode {
  const s = String(v ?? "auto").trim().toLowerCase();
  if (s === "fast" || s === "pro" || s === "auto") return s;
  // compat: si llega "chat" desde hocker.one por defecto
  return "auto";
}

function detectIntent(message: string): Intent {
  const t = message.toLowerCase();

  // code
  if (
    t.includes("```") ||
    t.includes("typescript") ||
    t.includes("javascript") ||
    t.includes("npm ") ||
    t.includes("pnpm") ||
    t.includes("yarn") ||
    t.includes("tsc") ||
    t.includes("nextjs") ||
    t.includes("supabase") ||
    t.includes("error:") ||
    t.includes("stack") ||
    t.includes("compile")
  )
    return "code";

  // ops
  if (
    t.includes("deploy") ||
    t.includes("despleg") ||
    t.includes("docker") ||
    t.includes("cloud run") ||
    t.includes("hetzner") ||
    t.includes("pm2") ||
    t.includes("nginx")
  )
    return "ops";

  // research
  if (t.includes("investiga") || t.includes("cita") || t.includes("fuentes") || t.includes("documentación"))
    return "research";

  return "general";
}

export type Route = {
  provider: Provider;
  model: string;
  mode: Mode;
  intent: Intent;
  reason: string;
};

export async function chooseRoute(args: {
  project_id: string;
  message: string;
  prefer?: Prefer | null;
  mode?: any;
}): Promise<Route> {
  const project_id = String(args.project_id || "global").trim() || "global";
  const mode = normMode(args.mode);
  const prefer = (args.prefer ?? "auto") as Prefer;
  const intent = detectIntent(args.message);

  // Prefer explícito gana.
  if (prefer === "openai" || prefer === "gemini") {
    return {
      provider: prefer,
      model: modelFor(prefer, mode),
      mode,
      intent,
      reason: `prefer=${prefer}`
    };
  }

  // Auto-router por modo/costo + budgets opcionales.
  let provider: Provider = mode === "fast" ? "gemini" : "openai";
  let reason = mode === "fast" ? "mode=fast -> gemini" : "default -> openai";

  if (config.budgets.enabled) {
    const [openaiTokens, geminiTokens] = await Promise.all([
      tokensUsedThisMonth(project_id, "openai"),
      tokensUsedThisMonth(project_id, "gemini")
    ]);

    if (provider === "openai" && openaiTokens >= config.budgets.openaiMonthlyTokens) {
      provider = "gemini";
      reason = `openai budget exceeded (${openaiTokens}/${config.budgets.openaiMonthlyTokens}) -> gemini`;
    }
    if (provider === "gemini" && geminiTokens >= config.budgets.geminiMonthlyTokens) {
      provider = "openai";
      reason = `gemini budget exceeded (${geminiTokens}/${config.budgets.geminiMonthlyTokens}) -> openai`;
    }
  }

  return {
    provider,
    model: modelFor(provider, mode),
    mode,
    intent,
    reason
  };
}