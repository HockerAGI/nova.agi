export type Provider = "openai" | "gemini";

// Modo/tier del router (alineado con hocker.one NovaChat)
export type Mode = "auto" | "fast" | "pro";

export type Intent = "general" | "code" | "ops" | "research";

export type Prefer = Provider | "auto";

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type Action = {
  node_id?: string;
  command: string;
  payload?: any;
};

export type ChatRequest = {
  project_id?: string;
  thread_id?: string | null;
  message?: string;
  text?: string; // compat
  prefer?: Prefer;
  mode?: Mode | string; // aceptamos string por compat (si llega "chat")
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
  // Acciones encoladas (si allow_actions=true)
  actions?: any[];
  meta?: any;
};

export type ErrorResponse = {
  ok: false;
  error: string;
  detail?: any;
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