import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  NODE_ENV: z.enum(["development", "production"]).default("production"),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  HOCKER_ONE_API_URL: z.string().url().default("http://localhost:3000"),
  NOVA_ORCHESTRATOR_KEY: z.string().min(24).optional(),

  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OLLAMA_ENABLED: z.coerce.boolean().default(false),
  OLLAMA_BASE_URL: z.string().default("http://127.0.0.1:11434"),

  BUDGETS_ENABLED: z.coerce.boolean().default(true),
  BUDGET_OPENAI: z.coerce.number().int().nonnegative().default(100),
  BUDGET_GEMINI: z.coerce.number().int().nonnegative().default(100),
  BUDGET_ANTHROPIC: z.coerce.number().int().nonnegative().default(100),

  LANGFUSE_PUBLIC_KEY: z.string().optional().default(""),
  LANGFUSE_SECRET_KEY: z.string().optional().default(""),
  LANGFUSE_BASE_URL: z.string().url().default("https://cloud.langfuse.com"),
});

const env = envSchema.parse(process.env);

export const config = {
  PORT: String(env.PORT),
  port: env.PORT,
  NODE_ENV: env.NODE_ENV,

  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseUrl: env.SUPABASE_URL,
  supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,

  hockerOneApiUrl: env.HOCKER_ONE_API_URL,
  orchestratorKey: env.NOVA_ORCHESTRATOR_KEY ?? "",

  openai: { apiKey: env.OPENAI_API_KEY ?? "" },
  gemini: { apiKey: env.GEMINI_API_KEY ?? "" },
  anthropic: { apiKey: env.ANTHROPIC_API_KEY ?? "" },
  ollama: {
    enabled: env.OLLAMA_ENABLED,
    baseUrl: env.OLLAMA_BASE_URL,
  },

  budgetsEnabled: env.BUDGETS_ENABLED,
  budgetOpenAI: env.BUDGET_OPENAI,
  budgetGemini: env.BUDGET_GEMINI,
  budgetAnthropic: env.BUDGET_ANTHROPIC,

  langfuse: {
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    baseUrl: env.LANGFUSE_BASE_URL,
  },
};

export function providerReady(provider: "openai" | "gemini" | "anthropic" | "ollama"): boolean {
  if (provider === "ollama") return Boolean(config.ollama.enabled);
  if (provider === "openai") return Boolean(config.openai.apiKey);
  if (provider === "gemini") return Boolean(config.gemini.apiKey);
  return Boolean(config.anthropic.apiKey);
}

export function modelFor(provider: "openai" | "gemini" | "anthropic" | "ollama", mode: "auto" | "fast" | "pro") {
  if (provider === "openai") {
    return mode === "pro" ? "gpt-4o" : "gpt-4o-mini";
  }
  if (provider === "gemini") {
    return mode === "pro" ? "gemini-2.5-pro" : "gemini-2.5-flash";
  }
  if (provider === "anthropic") {
    return mode === "pro" ? "claude-3-5-sonnet-latest" : "claude-3-5-haiku-latest";
  }
  return mode === "pro" ? "llama3.1:70b" : "llama3.1:8b";
}