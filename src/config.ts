import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.string().optional(),

  PORT: z.coerce.number().default(8787),

  // Auth para que SOLO tu panel pueda pegarle
  NOVA_ORCHESTRATOR_KEY: z.string().min(10),

  // Providers
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-1.5-flash"),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  // Firma de comandos (DEBE match con hocker.one + agent)
  COMMAND_HMAC_SECRET: z.string().optional(),
  HOCKER_COMMAND_SIGNING_SECRET: z.string().optional(), // legacy fallback

  // Defaults
  HOCKER_PROJECT_ID: z.string().default("global"),
  HOCKER_DEFAULT_NODE_ID: z.string().default("hocker-node-1"),

  // Actions
  ACTIONS_ENABLED: z.coerce.boolean().default(true),
  ACTIONS_REQUIRE_HEADER: z.coerce.boolean().default(true)
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  // error claro, sin humo
  console.error("ENV inválido:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const e = parsed.data;

function pickSigningSecret() {
  const v = (e.COMMAND_HMAC_SECRET || e.HOCKER_COMMAND_SIGNING_SECRET || "").trim();
  return v || null;
}

export const config = {
  env: e.NODE_ENV || "production",
  port: e.PORT,

  orchestratorKey: e.NOVA_ORCHESTRATOR_KEY,

  openai: {
    apiKey: e.OPENAI_API_KEY || null,
    model: e.OPENAI_MODEL
  },

  gemini: {
    apiKey: e.GEMINI_API_KEY || null,
    model: e.GEMINI_MODEL
  },

  supabase: {
    url: e.SUPABASE_URL,
    serviceRoleKey: e.SUPABASE_SERVICE_ROLE_KEY
  },

  commands: {
    signingSecret: pickSigningSecret(), // puede ser null si aún no lo configuras (acciones se desactivan solas)
    projectId: e.HOCKER_PROJECT_ID,
    defaultNodeId: e.HOCKER_DEFAULT_NODE_ID
  },

  actionsEnabled: Boolean(e.ACTIONS_ENABLED),
  actionsRequireHeader: Boolean(e.ACTIONS_REQUIRE_HEADER)
};