export type Provider = "openai" | "gemini";
export type Intent = "code" | "research" | "ops" | "general";
export type Mode = "fast" | "pro" | "auto";

export type ChatRequest = {
  project_id?: string;
  thread_id?: string;
  message?: string; // preferido
  text?: string;    // compat con tu hocker.one actual
  prefer?: Provider | "auto";
  mode?: Mode;
};

export type ChatResponse = {
  ok: boolean;
  project_id: string;
  thread_id: string;
  provider: Provider;
  model: string;
  intent: Intent;
  agi_id: string;
  reply: string;
  actions_executed: number;
  meta: Record<string, any>;
};

export type DbMessageRole = "system" | "user" | "assistant" | "nova";

export type NovaDbMessage = {
  id: string;
  project_id: string;
  thread_id: string;
  role: DbMessageRole;
  content: string;
  created_at: string;
};

export type Action =
  | {
      type: "event";
      level?: "info" | "warn" | "error";
      event_type: string;
      message: string;
      node_id?: string | null;
      data?: any;
    }
  | {
      type: "enqueue_command";
      node_id: string;
      command: string;
      payload?: any;
    };

export type AgiDef = {
  id: string;
  name: string;
  kind: string;
  level: number;
  parent_id?: string | null;
  tags: string[];
  system_prompt: string;
};