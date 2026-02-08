import { z } from "zod";

const Env = z.object({
  PORT: z.string().optional(),
  NODE_ENV: z.string().optional(),

  NOVA_ORCHESTRATOR_KEY: z.string().min(8),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  DEFAULT_PROJECT_ID: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),

  OPENAI_MODEL_FAST: z.string().optional(),
  OPENAI_MODEL_PRO: z.string().optional(),
  GEMINI_MODEL_FAST: z.string().optional(),
  GEMINI_MODEL_PRO: z.string().optional(),

  ROUTER_ENABLE_BUDGETS: z.string().optional(),
  BUDGET_MONTHLY_OPENAI_TOKENS: z.string().optional(),
  BUDGET_MONTHLY_GEMINI_TOKENS: z.string().optional(),

  ACTIONS_ENABLED: z.string().optional(),
  ACTIONS_REQUIRE_HEADER: z.string().optional()
});

export const config = (() => {
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error(parsed.error.flatten());
    throw new Error("Invalid environment variables");
  }
  const e = parsed.data;

  return {
    port: Number(e.PORT ?? 8080),
    env: e.NODE_ENV ?? "production",

    orchestratorKey: e.NOVA_ORCHESTRATOR_KEY,

    supabaseUrl: e.SUPABASE_URL,
    supabaseServiceRoleKey: e.SUPABASE_SERVICE_ROLE_KEY,

    defaultProjectId: e.DEFAULT_PROJECT_ID ?? "global",

    openaiApiKey: e.OPENAI_API_KEY ?? "",
    geminiApiKey: e.GEMINI_API_KEY ?? "",

    openaiModelFast: e.OPENAI_MODEL_FAST ?? "gpt-4o-mini",
    openaiModelPro: e.OPENAI_MODEL_PRO ?? "gpt-4o",
    geminiModelFast: e.GEMINI_MODEL_FAST ?? "gemini-1.5-flash",
    geminiModelPro: e.GEMINI_MODEL_PRO ?? "gemini-1.5-pro",

    budgetsEnabled: (e.ROUTER_ENABLE_BUDGETS ?? "1") === "1",
    budgetOpenaiTokens: Number(e.BUDGET_MONTHLY_OPENAI_TOKENS ?? 200000),
    budgetGeminiTokens: Number(e.BUDGET_MONTHLY_GEMINI_TOKENS ?? 400000),

    actionsEnabled: (e.ACTIONS_ENABLED ?? "0") === "1",
    actionsRequireHeader: (e.ACTIONS_REQUIRE_HEADER ?? "1") === "1"
  };
})();