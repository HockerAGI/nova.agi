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
  BASE44_API_KEY: z.string().optional(),
  OLLAMA_ENABLED: z.coerce.boolean().default(false),
  OLLAMA_BASE_URL: z.string().default("http://127.0.0.1:11434"),

  BUDGETS_ENABLED: z.coerce.boolean().default(true),
  BUDGET_OPENAI: z.coerce.number().int().nonnegative().default(100),
  BUDGET_GEMINI: z.coerce.number().int().nonnegative().default(100),
  BUDGET_ANTHROPIC: z.coerce.number().int().nonnegative().default(100),

  LANGFUSE_PUBLIC_KEY: z.string().optional().default(""),
  LANGFUSE_SECRET_KEY: z.string().optional().default(""),
  LANGFUSE_BASE_URL: z.string().url().default("https://cloud.langfuse.com"),

  DEFAULT_PROVIDER: z.enum(["openai", "gemini", "anthropic", "ollama", "base44"]).default("openai"),
  PROVIDER_FALLBACKS: z.string().default("openai,gemini,anthropic,ollama,base44"),
  TEXT_PROVIDER_ORDER: z.string().default("openai,gemini,anthropic,ollama,base44"),
  CODE_PROVIDER_ORDER: z.string().default("openai,anthropic,gemini,ollama,base44"),
  LONG_CONTEXT_PROVIDER_ORDER: z.string().default("gemini,openai,anthropic,ollama,base44"),
  IMAGE_PROVIDER: z.enum(["openai", "gemini", "ollama"]).default("openai"),
  VIDEO_PROVIDER: z.enum(["gemini", "openai"]).default("gemini"),
  HIDE_PROVIDER_FROM_USER: z.coerce.boolean().default(true),

  OPENAI_MODEL_AUTO: z.string().optional().default(""),
  OPENAI_MODEL_FAST: z.string().optional().default(""),
  OPENAI_MODEL_PRO: z.string().optional().default(""),
  GEMINI_MODEL_AUTO: z.string().optional().default(""),
  GEMINI_MODEL_FAST: z.string().optional().default(""),
  GEMINI_MODEL_PRO: z.string().optional().default(""),
  ANTHROPIC_MODEL_AUTO: z.string().optional().default(""),
  ANTHROPIC_MODEL_FAST: z.string().optional().default(""),
  ANTHROPIC_MODEL_PRO: z.string().optional().default(""),
  OLLAMA_MODEL_AUTO: z.string().optional().default(""),
  OLLAMA_MODEL_FAST: z.string().optional().default(""),
  OLLAMA_MODEL_PRO: z.string().optional().default(""),
  BASE44_MODEL_AUTO: z.string().optional().default(""),
  BASE44_MODEL_FAST: z.string().optional().default(""),
  BASE44_MODEL_PRO: z.string().optional().default(""),

  NOVA_SURVIVAL_MODE_ENABLED: z.coerce.boolean().default(true),
  NOVA_SURVIVAL_REPLY: z.string().optional().default(""),

  // ── MCP Connectors ──────────────────────────────────────────
  // GitHub
  GITHUB_TOKEN: z.string().optional(),
  HOCKER_GITHUB_TOKEN: z.string().optional(),
  GH_TOKEN: z.string().optional(),
  // Vercel
  VERCEL_TOKEN: z.string().optional(),
  HOCKER_VERCEL_TOKEN: z.string().optional(),
  VERCEL_TEAM_ID: z.string().optional(),
  HOCKER_VERCEL_TEAM_ID: z.string().optional(),
  // OpenAI (MCP — additional capabilities beyond chat)
  HOCKER_OPENAI_API_KEY: z.string().optional(),
  OPENAI_ORG_ID: z.string().optional(),
  // MCP master switch
  MCP_ENABLED: z.coerce.boolean().default(true),
  // Mirror node
  NOVA_MIRROR_NODE_ENABLED: z.coerce.boolean().default(true),
  NOVA_MIRROR_NODE_ID: z.string().default("nova-mirror-1"),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV === "production" && !String(env.NOVA_ORCHESTRATOR_KEY ?? "").trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["NOVA_ORCHESTRATOR_KEY"],
      message: "NOVA_ORCHESTRATOR_KEY es obligatorio en producción.",
    });
  }
});

const env = envSchema.parse(process.env);

function parseProviderOrder(value: string): Array<"openai" | "gemini" | "anthropic" | "ollama" | "base44"> {
  const allowed = new Set(["openai", "gemini", "anthropic", "ollama", "base44"]);
  const order = value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is "openai" | "gemini" | "anthropic" | "ollama" | "base44" => allowed.has(item));

  return order.length > 0 ? order : ["openai", "gemini", "anthropic", "ollama"];
}

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
  base44: { apiKey: env.BASE44_API_KEY ?? "" },
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

  providerRouting: {
    defaultProvider: env.DEFAULT_PROVIDER,
    fallbacks: parseProviderOrder(env.PROVIDER_FALLBACKS),
    textOrder: parseProviderOrder(env.TEXT_PROVIDER_ORDER),
    codeOrder: parseProviderOrder(env.CODE_PROVIDER_ORDER),
    longContextOrder: parseProviderOrder(env.LONG_CONTEXT_PROVIDER_ORDER),
    imageProvider: env.IMAGE_PROVIDER,
    videoProvider: env.VIDEO_PROVIDER,
    hideProviderFromUser: env.HIDE_PROVIDER_FROM_USER,
  },

  modelOverrides: {
    openai: {
      auto: env.OPENAI_MODEL_AUTO,
      fast: env.OPENAI_MODEL_FAST,
      pro: env.OPENAI_MODEL_PRO,
    },
    gemini: {
      auto: env.GEMINI_MODEL_AUTO,
      fast: env.GEMINI_MODEL_FAST,
      pro: env.GEMINI_MODEL_PRO,
    },
    anthropic: {
      auto: env.ANTHROPIC_MODEL_AUTO,
      fast: env.ANTHROPIC_MODEL_FAST,
      pro: env.ANTHROPIC_MODEL_PRO,
    },
    ollama: {
      auto: env.OLLAMA_MODEL_AUTO,
      fast: env.OLLAMA_MODEL_FAST,
      pro: env.OLLAMA_MODEL_PRO,
    },
    base44: {
      auto: env.BASE44_MODEL_AUTO,
      fast: env.BASE44_MODEL_FAST,
      pro: env.BASE44_MODEL_PRO,
    },
  },

  survival: {
    enabled: env.NOVA_SURVIVAL_MODE_ENABLED,
    reply: env.NOVA_SURVIVAL_REPLY,
  },

  mcp: {
    enabled: env.MCP_ENABLED,
    github: {
      token: env.GITHUB_TOKEN ?? env.HOCKER_GITHUB_TOKEN ?? env.GH_TOKEN ?? "",
    },
    vercel: {
      token: env.VERCEL_TOKEN ?? env.HOCKER_VERCEL_TOKEN ?? "",
      teamId: env.VERCEL_TEAM_ID ?? env.HOCKER_VERCEL_TEAM_ID ?? "",
    },
    openai: {
      apiKey: env.HOCKER_OPENAI_API_KEY ?? env.OPENAI_API_KEY ?? "",
      orgId: env.OPENAI_ORG_ID ?? "",
    },
  },

  mirrorNode: {
    enabled: env.NOVA_MIRROR_NODE_ENABLED,
    nodeId: env.NOVA_MIRROR_NODE_ID,
  },
};

export function providerReady(provider: "openai" | "gemini" | "anthropic" | "ollama" | "base44"): boolean {
  if (provider === "ollama") return Boolean(config.ollama.enabled);
  if (provider === "openai") return Boolean(config.openai.apiKey);
  if (provider === "gemini") return Boolean(config.gemini.apiKey);
  if (provider === "base44") return Boolean(config.base44.apiKey);
  return Boolean(config.anthropic.apiKey);
}

export function modelFor(provider: "openai" | "gemini" | "anthropic" | "ollama" | "base44", mode: "auto" | "fast" | "pro") {
  const override = config.modelOverrides[provider][mode]?.trim();
  if (override) return override;

  if (provider === "openai") {
    return mode === "pro" ? "gpt-4o" : "gpt-4o-mini";
  }
  if (provider === "gemini") {
    return mode === "pro" ? "gemini-2.5-pro" : "gemini-2.5-flash";
  }
  if (provider === "anthropic") {
    return mode === "pro" ? "claude-3-5-sonnet-latest" : "claude-3-5-haiku-latest";
  }
  if (provider === "base44") {
    // Base44 manages model selection internally; these are labels only
    return mode === "pro" ? "base44-pro" : mode === "fast" ? "base44-fast" : "base44-auto";
  }
  return mode === "pro" ? "llama3.1:70b" : "llama3.1:8b";
}