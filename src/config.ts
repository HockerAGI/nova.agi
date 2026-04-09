// nova.agi-main/src/config.ts
import { z } from "zod";

export type Provider = "openai" | "gemini" | "anthropic" | "ollama";

function readString(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function readNumber(name: string, fallback: number): number {
  const raw = readString(name);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function readBool(name: string, fallback = false): boolean {
  const raw = readString(name);
  if (!raw) return fallback;

  const s = raw.toLowerCase();
  if (["1", "true", "yes", "on"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;

  return fallback;
}

const Bool = z
  .string()
  .optional()
  .transform((v) => {
    const s = String(v ?? "").trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes" || s === "on";
  });

const Schema = z.object({
  port: z.coerce.number().int().positive().default(8080),
  orchestratorKey: z.string().min(16),

  supabase: z.object({
    url: z.string().url(),
    serviceRoleKey: z.string().min(20),
  }),

  commandHmacSecret: z.string().min(24),
  hockerOneApiUrl: z.string().url().optional().default(""),

  openai: z.object({
    apiKey: z.string().optional(),
    modelBase: z.string().default("gpt-4o"),
    modelFast: z.string().optional().default("gpt-4o-mini"),
    modelPro: z.string().optional().default("gpt-4.1"),
  }),

  gemini: z.object({
    apiKey: z.string().optional(),
    modelBase: z.string().default("gemini-2.0-flash"),
    modelFast: z.string().optional().default("gemini-2.0-flash-lite"),
    modelPro: z.string().optional().default("gemini-2.5-pro"),
  }),

  anthropic: z.object({
    apiKey: z.string().optional(),
    modelBase: z.string().default("claude-sonnet-4-5"),
    modelFast: z.string().optional().default("claude-haiku-4-5"),
    modelPro: z.string().optional().default("claude-opus-4-5"),
  }),

  ollama: z.object({
    enabled: Bool.default(true),
    baseUrl: z.string().url().optional().default("http://127.0.0.1:11434"),
    modelBase: z.string().default("llama3:8b"),
    modelFast: z.string().optional().default("llama3:8b"),
    modelPro: z.string().optional().default("llama3.1:70b"),
  }),

  langfuse: z.object({
    publicKey: z.string().optional(),
    secretKey: z.string().optional(),
    baseUrl: z.string().url().optional().default("https://cloud.langfuse.com"),
  }),

  budgets: z.object({
    enabled: Bool.default(false),
    openaiMonthlyTokens: z.number().int().nonnegative().default(250000),
    geminiMonthlyTokens: z.number().int().nonnegative().default(250000),
    anthropicMonthlyTokens: z.number().int().nonnegative().default(250000),
  }),

  actions: z.object({
    enabled: Bool.default(false),
    defaultNeedsApproval: Bool.default(false),
    defaultNodeId: z.string().default("hocker-node-1"),
    fallbackNodeId: z.string().default("hocker-fabric"),
    requireHeader: Bool.default(false),
  }),
});

const raw = {
  port: readNumber("PORT", 8080),
  orchestratorKey: readString("NOVA_ORCHESTRATOR_KEY") ?? "",
  supabase: {
    url: readString("SUPABASE_URL") ?? "",
    serviceRoleKey: readString("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  },
  commandHmacSecret: readString("NOVA_COMMAND_HMAC_SECRET") ?? "",
  hockerOneApiUrl: readString("HOCKER_ONE_API_URL") ?? "",

  openai: {
    apiKey: readString("OPENAI_API_KEY"),
    modelBase: readString("OPENAI_MODEL") ?? "gpt-4o",
    modelFast: readString("OPENAI_MODEL_FAST") ?? "gpt-4o-mini",
    modelPro: readString("OPENAI_MODEL_PRO") ?? "gpt-4.1",
  },

  gemini: {
    apiKey: readString("GEMINI_API_KEY"),
    modelBase: readString("GEMINI_MODEL") ?? "gemini-2.0-flash",
    modelFast: readString("GEMINI_MODEL_FAST") ?? "gemini-2.0-flash-lite",
    modelPro: readString("GEMINI_MODEL_PRO") ?? "gemini-2.5-pro",
  },

  anthropic: {
    apiKey: readString("ANTHROPIC_API_KEY"),
    modelBase: readString("ANTHROPIC_MODEL") ?? "claude-sonnet-4-5",
    modelFast: readString("ANTHROPIC_MODEL_FAST") ?? "claude-haiku-4-5",
    modelPro: readString("ANTHROPIC_MODEL_PRO") ?? "claude-opus-4-5",
  },

  ollama: {
    enabled: readBool("OLLAMA_ENABLED", true),
    baseUrl: readString("OLLAMA_BASE_URL") ?? "http://127.0.0.1:11434",
    modelBase: readString("OLLAMA_MODEL") ?? "llama3:8b",
    modelFast: readString("OLLAMA_MODEL_FAST") ?? "llama3:8b",
    modelPro: readString("OLLAMA_MODEL_PRO") ?? "llama3.1:70b",
  },

  langfuse: {
    publicKey: readString("LANGFUSE_PUBLIC_KEY"),
    secretKey: readString("LANGFUSE_SECRET_KEY"),
    baseUrl: readString("LANGFUSE_BASE_URL") ?? "https://cloud.langfuse.com",
  },

  budgets: {
    enabled: readBool("BUDGETS_ENABLED", false),
    openaiMonthlyTokens: readNumber("BUDGET_OPENAI_TOKENS", 250000),
    geminiMonthlyTokens: readNumber("BUDGET_GEMINI_TOKENS", 250000),
    anthropicMonthlyTokens: readNumber("BUDGET_ANTHROPIC_TOKENS", 250000),
  },

  actions: {
    enabled: readBool("ACTIONS_ENABLED", false),
    defaultNeedsApproval: readBool("ACTIONS_NEED_APPROVAL", false),
    defaultNodeId: readString("DEFAULT_NODE_ID") ?? "hocker-node-1",
    fallbackNodeId: readString("FALLBACK_NODE_ID") ?? "hocker-fabric",
    requireHeader: readBool("ACTIONS_REQUIRE_HEADER", false),
  },
};

export const config = Schema.parse(raw);

export function providerReady(provider: Provider): boolean {
  if (provider === "openai") return Boolean(config.openai.apiKey);
  if (provider === "gemini") return Boolean(config.gemini.apiKey);
  if (provider === "anthropic") return Boolean(config.anthropic.apiKey);
  return config.ollama.enabled;
}

export function modelFor(provider: Provider, mode: "auto" | "fast" | "pro"): string {
  if (provider === "openai") {
    if (mode === "fast") return config.openai.modelFast || config.openai.modelBase;
    if (mode === "pro") return config.openai.modelPro || config.openai.modelBase;
    return config.openai.modelBase;
  }

  if (provider === "gemini") {
    if (mode === "fast") return config.gemini.modelFast || config.gemini.modelBase;
    if (mode === "pro") return config.gemini.modelPro || config.gemini.modelBase;
    return config.gemini.modelBase;
  }

  if (provider === "anthropic") {
    if (mode === "fast") return config.anthropic.modelFast || config.anthropic.modelBase;
    if (mode === "pro") return config.anthropic.modelPro || config.anthropic.modelBase;
    return config.anthropic.modelBase;
  }

  if (mode === "fast") return config.ollama.modelFast || config.ollama.modelBase;
  if (mode === "pro") return config.ollama.modelPro || config.ollama.modelBase;
  return config.ollama.modelBase;
}