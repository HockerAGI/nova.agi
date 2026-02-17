import { supabase } from "./supabase.js";

export type DbRole = "system" | "user" | "assistant" | "nova";

export type NovaDbMessage = {
  id: string;
  project_id: string;
  thread_id: string;
  role: DbRole;
  content: string;
  created_at: string;
};

export async function ensureThread(args: { project_id: string; thread_id: string; user_id?: string | null; title?: string | null }) {
  // Best-effort: si tablas no existen aún, no tronamos.
  try {
    await supabase
      .from("nova_threads")
      .upsert(
        {
          id: args.thread_id,
          project_id: args.project_id,
          user_id: args.user_id ?? null,
          title: args.title ?? null
        },
        { onConflict: "id" }
      );
  } catch {
    // ignore
  }
}

export async function appendMessage(project_id: string, thread_id: string, role: DbRole, content: string) {
  try {
    await supabase.from("nova_messages").insert({ project_id, thread_id, role, content });
  } catch {
    // ignore
  }
}

export async function loadThread(project_id: string, thread_id: string, limit = 30): Promise<NovaDbMessage[]> {
  try {
    const { data, error } = await supabase
      .from("nova_messages")
      .select("id, project_id, thread_id, role, content, created_at")
      .eq("project_id", project_id)
      .eq("thread_id", thread_id)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error || !data) return [];
    return data as any;
  } catch {
    return [];
  }
}

export function toChatRole(role: DbRole): "system" | "user" | "assistant" {
  if (role === "nova") return "assistant";
  return role;
}