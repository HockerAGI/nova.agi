import "dotenv/config";
import { z } from "zod";
import type { Provider } from "./types.js";

const Bool = z
  .string()
  .optional()
  .transform((v) => {
    const s = String(v ?? "").trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes" || s === "on";
  });

function read(name: string): string {
  return (process.env[name] ?? "").trim();
}

function readOpt(name: string): string | undefined {
  const v = read(name);
  return v || undefined;
}

function readNum(name: string, fallback: number): number {
  const v = Number(read(name));
  return Number.isFinite(v) ? v : fallback;
}

const Schema = z.object({
  port: z.coerce.number().int().positive().default(8080),
  nodeEnv: z.string().default("production"),

  orchestratorKey: z.string().min(16),

  supabaseUrl: z.string().url(),
  supabaseServiceRoleKey: z.string().min(20),

  hockerOneApiUrl: z.string().url().optional().default(""),

  commandHmacSecret: z.string().min(24),

  openai: z.object({
    apiKey: z.string().optional(),
    modelBase: z.string().default("gpt-4o"),
    modelFast: z.string().default("gpt-4o-mini"),
    modelPro: z.string().default("gpt-4.1")
  }),
  gemini: z.object({
    apiKey: z.string().optional(),
    modelBase: z.string().default("gemini-2.0-flash"),
    modelFast: z.string().default("gemini-2.0-flash-lite"),
    modelPro: z.string().default("gemini-2.5-pro")
  }),
  anthropic: z.object({
    apiKey: z.string().optional(),
    modelBase: z.string().default("claude-sonnet-4-5"),
    modelFast: z.string().default("claude-haiku-4-5"),
    modelPro: z.string().default("claude-opus-4-5")
  }),
  ollama: z.object({
    enabled: Bool.default(true),
    baseUrl: z.string().url().default("http://127.0.0.1:11434"),
    modelBase: z.string().default("llama3:8b"),
    modelFast: z.string().default("llama3:8b"),
    modelPro: z.string().default("llama3.1:70b")
  }),

  budgetsEnabled: Bool.default(false),
  budgetOpenAI: z.coerce.number().int().nonnegative().default(250000),
  budgetGemini: z.coerce.number().int().nonnegative().default(250000),
  budgetAnthropic: z.coerce.number().int().nonnegative().default(250000),

  actionsEnabled: Bool.default(true),
  actionsNeedApproval: Bool.default(true),
  defaultNodeId: z.string().default("hocker-node-1"),
  fallbackNodeId: z.string().default("hocker-fabric"),
  requireActionHeader: Bool.default(false),

  requestTimeoutMs: z.coerce.number().int().positive().default(45000)
});

const raw = {
  port: readNum("PORT", 8080),
  nodeEnv: read("NODE_ENV") || "production",
  orchestratorKey: read("NOVA_ORCHESTRATOR_KEY"),
  supabaseUrl: read("SUPABASE_URL"),
  supabaseServiceRoleKey: read("SUPABASE_SERVICE_ROLE_KEY"),
  hockerOneApiUrl: readOpt("HOCKER_ONE_API_URL") ?? "",
  commandHmacSecret: read("NOVA_COMMAND_HMAC_SECRET"),

  openai: {
    apiKey: readOpt("OPENAI_API_KEY"),
    modelBase: read("OPENAI_MODEL") || "gpt-4o",
    modelFast: read("OPENAI_MODEL_FAST") || "gpt-4o-mini",
    modelPro: read("OPENAI_MODEL_PRO") || "gpt-4.1"
  },
  gemini: {
    apiKey: readOpt("GEMINI_API_KEY"),
    modelBase: read("GEMINI_MODEL") || "gemini-2.0-flash",
    modelFast: read("GEMINI_MODEL_FAST") || "gemini-2.0-flash-lite",
    modelPro: read("GEMINI_MODEL_PRO") || "gemini-2.5-pro"
  },
  anthropic: {
    apiKey: readOpt("ANTHROPIC_API_KEY"),
    modelBase: read("ANTHROPIC_MODEL") || "claude-sonnet-4-5",
    modelFast: read("ANTHROPIC_MODEL_FAST") || "claude-haiku-4-5",
    modelPro: read("ANTHROPIC_MODEL_PRO") || "claude-opus-4-5"
  },
  ollama: {
    enabled: Bool.parse(read("OLLAMA_ENABLED") || "true"),
    baseUrl: read("OLLAMA_BASE_URL") || "http://127.0.0.1:11434",
    modelBase: read("OLLAMA_MODEL") || "llama3:8b",
    modelFast: read("OLLAMA_MODEL_FAST") || "llama3:8b",
    modelPro: read("OLLAMA_MODEL_PRO") || "llama3.1:70b"
  },
  budgetsEnabled: Bool.parse(read("BUDGETS_ENABLED") || "false"),
  budgetOpenAI: readNum("BUDGET_OPENAI_TOKENS", 250000),
  budgetGemini: readNum("BUDGET_GEMINI_TOKENS", 250000),
  budgetAnthropic: readNum("BUDGET_ANTHROPIC_TOKENS", 250000),
  actionsEnabled: Bool.parse(read("ACTIONS_ENABLED") || "true"),
  actionsNeedApproval: Bool.parse(read("ACTIONS_NEED_APPROVAL") || "true"),
  defaultNodeId: read("DEFAULT_NODE_ID") || "hocker-node-1",
  fallbackNodeId: read("FALLBACK_NODE_ID") || "hocker-fabric",
  requireActionHeader: Bool.parse(read("ACTIONS_REQUIRE_HEADER") || "false"),
  requestTimeoutMs: readNum("REQUEST_TIMEOUT_MS", 45000)
};

export const config = Schema.parse(raw);

export function providerReady(provider: Provider): boolean {
  if (provider === "openai") return Boolean(config.openai.apiKey);
  if (provider === "gemini") return Boolean(config.gemini.apiKey);
  if (provider === "anthropic") return Boolean(config.anthropic.apiKey);
  return config.ollama.enabled;
}

export function modelFor(provider: Provider, mode: "auto" | "fast" | "pro"): string {
  const map =
    provider === "openai"
      ? config.openai
      : provider === "gemini"
      ? config.gemini
      : provider === "anthropic"
      ? config.anthropic
      : config.ollama;

  if (mode === "fast") return map.modelFast || map.modelBase;
  if (mode === "pro") return map.modelPro || map.modelBase;
  return map.modelBase;
}