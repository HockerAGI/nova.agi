export type JsonPrimitive = string | number | boolean | null;
export type JsonArray = JsonValue[];
export type JsonObject = { [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/**
 * 🔥 PROVIDERS SOPORTADOS (ACTUALIZADO)
 * Se agrega "ollama" como proveedor local autónomo
 */
export type Provider = "openai" | "gemini" | "phi:latest";

/**
 * Modos de ejecución
 */
export type Mode = "auto" | "fast" | "pro";

/**
 * Intenciones del router cognitivo
 */
export type Intent =
  | "general"
  | "code"
  | "ops"
  | "research"
  | "finance"
  | "social";

/**
 * Preferencia de proveedor
 */
export type Prefer = Provider | "auto";

/**
 * Roles del chat
 */
export type ChatRole = "system" | "user" | "assistant";

/**
 * Mensaje base
 */
export type ChatMessage = {
  role: ChatRole;
  content: string;
};

/**
 * Acción ejecutable dentro del ecosistema
 */
export type Action = {
  node_id?: string;
  command: string;
  payload?: JsonObject;
};

/**
 * Request del endpoint /chat
 */
export type ChatRequest = {
  project_id?: string;
  thread_id?: string | null;
  message?: string;
  text?: string;
  prefer?: Prefer;
  mode?: Mode | string;
  allow_actions?: boolean;
  user_id?: string | null;
  user_email?: string | null;
};

/**
 * Respuesta exitosa
 */
export type ChatResponse = {
  ok: true;
  project_id: string;
  thread_id: string;
  provider: Provider;
  model: string;
  intent: Intent;
  agi_id: string;
  reply: string;
  trace_id?: string | null;
  actions?: Action[];
  meta?: JsonObject;
};

/**
 * Respuesta de error
 */
export type ErrorResponse = {
  ok: false;
  error: string;
  trace_id?: string | null;
  details?: string;
};

/**
 * Definición de AGI
 */
export type AgiDef = {
  id: string;
  name: string;
  kind: string;
  level: number;
  parent_id: string | null;
  tags: string[];
  system_prompt: string;
  description?: string;
  version?: string;
};

export type AGI = AgiDef;