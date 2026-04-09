export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = Record<string, JsonValue>;

export type Provider = "openai" | "gemini" | "anthropic" | "ollama";
export type Prefer = "auto" | Provider;
export type CompletionMode = "auto" | "fast" | "pro";

export type Intent = "general" | "ops" | "code" | "finance" | "social" | "research";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export type ChatMessage = {
  role: ChatRole;
  content: string;
  name?: string;
};

export type AgiDef = {
  id: string;
  name: string;
  kind: string;
  level: number;
  parent_id: string | null;
  tags: string[];
  system_prompt: string;
};

export type ChatRequest = {
  project_id?: string;
  thread_id?: string;
  message?: string;
  text?: string;
  prefer?: Prefer;
  mode?: CompletionMode;
  allow_actions?: boolean;
  user_id?: string | null;
  user_email?: string | null;
  context_data?: JsonObject | null;
};