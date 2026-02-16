export type ChatMode = "chat" | "planner" | "actions";

export type ChatRequest = {
  project_id?: string;
  thread_id?: string | null;
  message: string;
  prefer?: "openai" | "gemini";
  mode?: ChatMode;
  allow_actions?: boolean;
  user_id?: string | null;
  user_email?: string | null;
};

export type Action = {
  node_id?: string;
  command: string;
  payload?: any;
  reason?: string;
};

export type ChatResponse = {
  ok: boolean;
  thread_id: string;
  text: string;
  actions?: Action[];
  action_results?: any[];
  provider?: string;
  model?: string;
};