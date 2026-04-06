export type JsonPrimitive = string | number | boolean | null;
export type JsonArray = JsonValue[];
export type JsonObject = { [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export type Provider = "openai" | "gemini";
export type Mode = "auto" | "fast" | "pro";
export type Intent = "general" | "code" | "ops" | "research" | "finance" | "social";
export type Prefer = Provider | "auto";

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type Action = {
  node_id?: string;
  command: string;
  payload?: JsonObject;
};

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

export type ErrorResponse = {
  ok: false;
  error: string;
  trace_id?: string | null;
  details?: string;
};

export type AGI = {
  id: string;
  name: string;
  description: string;
  version?: string;
  tags: string[];
  level?: string;
  parent_id?: string | null;
  kind?: string;
  system_prompt: string;
};