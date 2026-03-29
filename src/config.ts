import { z } from "zod";

function readString(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
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

  hockerOneApiUrl: z.string().url().default("https://hocker.one"),

  langfuse: z.object({
    publicKey: z.string().min(5).default("dummy_pk"),
    secretKey: z.string().min(5).default("dummy_sk"),
    baseUrl: z.string().url().default("https://cloud.langfuse.com"),
  }),

  openai: z.object({
    apiKey: z.string().min(1).optional(),
    modelBase: z.string().min(1),
    modelFast: z.string().min(1).optional(),
    modelPro: z.string().min(1).optional(),
  }),

  gemini: z.object({
    apiKey: z.string().min(1).optional(),
    modelBase: z.string().min(1),
    modelFast: z.string().min(1).optional(),
    modelPro: z.string().min(1).optional(),
  }),

  budgets: z
    .object({
      enabled: z.boolean().default(false),
      openaiMonthlyTokens: z.number().int().positive().default(250000),
      geminiMonthlyTokens: z.number().int().positive().default(250000),
    })
    .default({ enabled: false, openaiMonthlyTokens: 250000, geminiMonthlyTokens: 250000 }),

  actions: z
    .object({
      enabled: z.boolean().default(true),
      defaultNeedsApproval: z.boolean().default(true),
      defaultNodeId: z.string().min(1).default("hocker-node-1"),
      fallbackNodeId: z.string().min(1).default("hocker-fabric"),
      requireHeader: z.boolean().default(true),
    })
    .default({
      enabled: true,
      defaultNeedsApproval: true,
      defaultNodeId: "hocker-node-1",
      fallbackNodeId: "hocker-fabric",
      requireHeader: true,
    }),
});

export type Config = z.infer<typeof Schema>;

export const config: Config = Schema.parse({
  port: readString("PORT") ?? 8080,
  orchestratorKey: readString("NOVA_ORCHESTRATOR_KEY", "ORCHESTRATOR_KEY", "HOCKER_ORCHESTRATOR_KEY"),

  supabase: {
    url: readString("SUPABASE_URL"),
    serviceRoleKey: readString("SUPABASE_SERVICE_ROLE_KEY"),
  },

  commandHmacSecret: readString("COMMAND_HMAC_SECRET"),
  hockerOneApiUrl: readString("HOCKER_ONE_URL", "HOCKER_ONE_API_URL") ?? "https://hocker.one",

  langfuse: {
    publicKey: readString("LANGFUSE_PUBLIC_KEY") ?? "dummy_pk",
    secretKey: readString("LANGFUSE_SECRET_KEY") ?? "dummy_sk",
    baseUrl: readString("LANGFUSE_BASE_URL") ?? "https://cloud.langfuse.com",
  },

  openai: {
    apiKey: readString("OPENAI_API_KEY"),
    modelBase: readString("OPENAI_MODEL") ?? "gpt-4o",
    modelFast: readString("OPENAI_MODEL_FAST"),
    modelPro: readString("OPENAI_MODEL_PRO"),
  },

  gemini: {
    apiKey: readString("GEMINI_API_KEY"),
    modelBase: readString("GEMINI_MODEL") ?? "gemini-2.0-flash",
    modelFast: readString("GEMINI_MODEL_FAST"),
    modelPro: readString("GEMINI_MODEL_PRO"),
  },

  budgets: {
    enabled: Bool.parse(process.env.BUDGETS_ENABLED),
    openaiMonthlyTokens: Number(process.env.BUDGET_OPENAI_TOKENS ?? 250000),
    geminiMonthlyTokens: Number(process.env.BUDGET_GEMINI_TOKENS ?? 250000),
  },

  actions: {
    enabled: Bool.parse(process.env.ACTIONS_ENABLED),
    defaultNeedsApproval: Bool.parse(process.env.ACTIONS_NEED_APPROVAL),
    defaultNodeId: readString("DEFAULT_NODE_ID") ?? "hocker-node-1",
    fallbackNodeId: readString("FALLBACK_NODE_ID") ?? "hocker-fabric",
    requireHeader: Bool.parse(process.env.ACTIONS_REQUIRE_HEADER),
  },
});

export function modelFor(provider: "openai" | "gemini", mode: "auto" | "fast" | "pro"): string {
  if (provider === "openai") {
    if (mode === "fast") return config.openai.modelFast || config.openai.modelBase;
    if (mode === "pro") return config.openai.modelPro || config.openai.modelBase;
    return config.openai.modelBase;
  }

  if (mode === "fast") return config.gemini.modelFast || config.gemini.modelBase;
  if (mode === "pro") return config.gemini.modelPro || config.gemini.modelBase;
  return config.gemini.modelBase;
}