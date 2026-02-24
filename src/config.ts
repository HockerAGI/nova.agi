import { z } from "zod";

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

  // Supabase (service role) para memoria + enqueue commands
  supabase: z.object({
    url: z.string().url(),
    serviceRoleKey: z.string().min(20)
  }),

  // Firma HMAC para commands (Alineado con VERTX y Cloudflare Tunnels)
  commandHmacSecret: z.string().min(24),

  // Observabilidad Cuántica (Syntia / Langfuse)
  langfuse: z.object({
    publicKey: z.string().min(5).default("dummy_pk"),
    secretKey: z.string().min(5).default("dummy_sk"),
    baseUrl: z.string().url().default("https://cloud.langfuse.com")
  }),

  // Provider keys
  openai: z.object({
    apiKey: z.string().min(20),
    modelBase: z.string().min(1),
    modelFast: z.string().min(1).optional(),
    modelPro: z.string().min(1).optional()
  }),
  gemini: z.object({
    apiKey: z.string().min(10),
    modelBase: z.string().min(1),
    modelFast: z.string().min(1).optional(),
    modelPro: z.string().min(1).optional()
  }),

  budgets: z
    .object({
      enabled: z.boolean().default(false),
      openaiMonthlyTokens: z.number().int().positive().default(250000),
      geminiMonthlyTokens: z.number().int().positive().default(250000)
    })
    .default({ enabled: false, openaiMonthlyTokens: 250000, geminiMonthlyTokens: 250000 }),

  actions: z
    .object({
      enabled: z.boolean().default(true),
      defaultNeedsApproval: z.boolean().default(true),
      defaultNodeId: z.string().min(1).default("hocker-fabric"), // ACTUALIZADO PARA AUTOMATION FABRIC
      requireHeader: z.boolean().default(true)
    })
    .default({ enabled: true, defaultNeedsApproval: true, defaultNodeId: "hocker-fabric", requireHeader: true })
});

export type Config = z.infer<typeof Schema>;

export const config: Config = Schema.parse({
  port: process.env.PORT ?? 8080,

  orchestratorKey:
    process.env.NOVA_ORCHESTRATOR_KEY ??
    process.env.ORCHESTRATOR_KEY ??
    process.env.HOCKER_ORCHESTRATOR_KEY,

  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  },

  commandHmacSecret: process.env.COMMAND_HMAC_SECRET,

  langfuse: {
    publicKey: process.env.LANGFUSE_PUBLIC_KEY || "dummy_pk",
    secretKey: process.env.LANGFUSE_SECRET_KEY || "dummy_sk",
    baseUrl: process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com"
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    modelBase: process.env.OPENAI_MODEL ?? "gpt-4o",
    modelFast: process.env.OPENAI_MODEL_FAST,
    modelPro: process.env.OPENAI_MODEL_PRO
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    modelBase: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
    modelFast: process.env.GEMINI_MODEL_FAST,
    modelPro: process.env.GEMINI_MODEL_PRO
  },

  budgets: {
    enabled: Bool.parse(process.env.BUDGETS_ENABLED),
    openaiMonthlyTokens: Number(process.env.BUDGET_OPENAI_TOKENS ?? 250000),
    geminiMonthlyTokens: Number(process.env.BUDGET_GEMINI_TOKENS ?? 250000)
  },

  actions: {
    enabled: Bool.parse(process.env.ACTIONS_ENABLED),
    defaultNeedsApproval: Bool.parse(process.env.ACTIONS_NEED_APPROVAL),
    defaultNodeId: process.env.DEFAULT_NODE_ID ?? "hocker-fabric",
    requireHeader: Bool.parse(process.env.ACTIONS_REQUIRE_HEADER)
  }
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