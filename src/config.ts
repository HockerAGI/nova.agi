import dotenv from "dotenv";
import { z } from "zod";
import type { NovaEnv } from "./types.js";

dotenv.config();

const boolFromEnv = (fallback: boolean) =>
  z.preprocess((value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
      if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
    }
    return fallback;
  }, z.boolean());

const nullableUrl = (fallback: string | null) =>
  z.preprocess((value) => {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }, z.string().url().nullable());

const nullableString = (fallback: string | null) =>
  z.preprocess((value) => {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }, z.string().nullable());

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  NODE_ENV: z.enum(["development", "production"]).default("production"),
  CORS_ORIGIN: z.string().default("*"),

  NOVA_ORCHESTRATOR_KEY: z.string().min(16, "NOVA_ORCHESTRATOR_KEY must be at least 16 characters"),
  COMMAND_HMAC_SECRET: nullableString(null),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  HOCKER_ONE_URL: nullableUrl(null),
  HOCKER_ONE_API_URL: nullableUrl(null),

  OPENAI_API_KEY: nullableString(null),
  OPENAI_MODEL: z.string().default("gpt-4o"),
  OPENAI_MODEL_FAST: z.string().default("gpt-4o-mini"),
  OPENAI_MODEL_PRO: z.string().default("gpt-4o"),

  GEMINI_API_KEY: nullableString(null),
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),
  GEMINI_MODEL_FAST: z.string().default("gemini-2.0-flash"),
  GEMINI_MODEL_PRO: z.string().default("gemini-2.0-pro"),

  ANTHROPIC_API_KEY: nullableString(null),
  ANTHROPIC_MODEL: z.string().default("claude-3-5-sonnet-latest"),
  ANTHROPIC_MODEL_FAST: z.string().default("claude-3-5-haiku-latest"),
  ANTHROPIC_MODEL_PRO: z.string().default("claude-3-5-sonnet-latest"),

  OLLAMA_BASE_URL: z.string().url().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().default("llama3.1"),
  OLLAMA_MODEL_FAST: z.string().default("llama3.1"),
  OLLAMA_MODEL_PRO: z.string().default("llama3.1"),

  ACTIONS_ENABLED: boolFromEnv(true),
  ACTIONS_NEED_APPROVAL: boolFromEnv(true),
  ACTIONS_REQUIRE_HEADER: boolFromEnv(true),
  DEFAULT_NODE_ID: z.string().default("hocker-node-1"),
  FALLBACK_NODE_ID: z.string().default("hocker-fabric"),
  PROJECT_DEFAULT_ID: z.string().default("hocker-one"),
  MAX_MEMORY_MESSAGES: z.coerce.number().int().min(0).max(50).default(12),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  LOG_LEVEL: z.string().default("info"),
});

const parsed = envSchema.parse(process.env);

export const config: NovaEnv = parsed;