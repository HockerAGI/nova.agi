export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type Provider = "openai" | "gemini" | "anthropic" | "ollama";
export type CompletionMode = "auto" | "fast" | "pro";
export type Intent =
  | "general"
  | "code"
  | "ops"
  | "research"
  | "finance"
  | "social"
  | "support"
  | "security";

export type Role = "system" | "user" | "assistant" | "tool";

export type AgiKey =
  | "NOVA"
  | "SYNTIA"
  | "VERTX"
  | "NUMIA"
  | "HOSTIA"
  | "JURIX"
  | "CURVEWIND"
  | "CANDY_ADS"
  | "PRO_IA"
  | "NOVA_ADS"
  | "CHIDO_GERENTE"
  | "CHIDO_WINS"
  | "NEXPA"
  | "TRACKHOK"
  | "REVIA"
  | "SHADOWS";

export interface AgiProfile {
  id: AgiKey;
  name: string;
  role: string;
  systemPrompt: string;
  intents: Intent[];
  defaultProvider: Provider;
  defaultMode: CompletionMode;
}

export interface ChatMessage {
  role: Role;
  content: string;
  name?: string;
  meta?: JsonObject;
}

export interface ChatRequest {
  project_id?: string;
  thread_id?: string | null;
  message?: string;
  text?: string;
  prompt?: string;
  user_id?: string | null;
  user_email?: string | null;
  prefer?: string;
  mode?: string;
  allow_actions?: boolean;
  context_data?: JsonObject | null;
}

export interface ActionItem {
  node_id?: string;
  command: string;
  payload?: JsonObject;
  needs_approval?: boolean;
}

export interface ChatResult {
  ok: true;
  project_id: string;
  thread_id: string;
  provider: Provider;
  model: string;
  intent: Intent;
  agi_id: AgiKey;
  reply: string;
  actions: ActionItem[];
  trace_id: string | null;
  meta: JsonObject;
}

export interface ErrorResult {
  ok: false;
  error: string;
  trace_id: string | null;
  details?: string;
}

export interface CompletionResult {
  provider: Provider;
  model: string;
  text: string;
  usage?: {
    tokens_in?: number;
    tokens_out?: number;
  };
  fallbackUsed: boolean;
}

export interface MemoryThread {
  id: string;
  project_id: string;
  user_id: string | null;
  title: string | null;
  summary: string | null;
  meta: JsonObject;
  created_at: string;
  updated_at: string;
}

export interface MemoryMessage {
  id: string;
  thread_id: string;
  project_id: string;
  user_id: string | null;
  role: Role;
  content: string;
  meta: JsonObject;
  created_at: string;
}

export interface ActionRow {
  id: string;
  project_id: string;
  thread_id: string | null;
  node_id: string | null;
  command: string;
  payload: JsonObject;
  status: "queued" | "needs_approval" | "approved" | "rejected" | "executed" | "failed";
  needs_approval: boolean;
  approved_by: string | null;
  rejected_by: string | null;
  result: JsonObject | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ControlRow {
  id: string;
  project_id: string;
  kill_switch: boolean;
  allow_write: boolean;
  meta: JsonObject;
  created_at: string;
  updated_at: string;
}

export interface NovaEnv {
  PORT: number;
  NODE_ENV: "development" | "production";
  CORS_ORIGIN: string;
  NOVA_ORCHESTRATOR_KEY: string;
  COMMAND_HMAC_SECRET: string | null;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  HOCKER_ONE_URL: string | null;
  HOCKER_ONE_API_URL: string | null;

  OPENAI_API_KEY: string | null;
  OPENAI_MODEL: string;
  OPENAI_MODEL_FAST: string;
  OPENAI_MODEL_PRO: string;

  GEMINI_API_KEY: string | null;
  GEMINI_MODEL: string;
  GEMINI_MODEL_FAST: string;
  GEMINI_MODEL_PRO: string;

  ANTHROPIC_API_KEY: string | null;
  ANTHROPIC_MODEL: string;
  ANTHROPIC_MODEL_FAST: string;
  ANTHROPIC_MODEL_PRO: string;

  OLLAMA_BASE_URL: string;
  OLLAMA_MODEL: string;
  OLLAMA_MODEL_FAST: string;
  OLLAMA_MODEL_PRO: string;

  ACTIONS_ENABLED: boolean;
  ACTIONS_NEED_APPROVAL: boolean;
  ACTIONS_REQUIRE_HEADER: boolean;
  DEFAULT_NODE_ID: string;
  FALLBACK_NODE_ID: string;
  PROJECT_DEFAULT_ID: string;
  MAX_MEMORY_MESSAGES: number;
  REQUEST_TIMEOUT_MS: number;
  LOG_LEVEL: string;
}