import { sb } from "./supabase.js";
import type { ChatRole } from "../types.js";

export function toChatRole(r: string): ChatRole {
  if (r === "system" || r === "user" || r === "assistant" || r === "nova") {
    return r as ChatRole;
  }
  return "user"; // fallback seguro
}

export async function ensureThread(opts: {
  project_id: string;
  thread_id: string;
  user_id?: string | null;
  title?: string;
}) {
  const { data: existing } = await sb
    .from("threads")
    .select("id")
    .eq("project_id", opts.project_id)
    .eq("id", opts.thread_id)
    .maybeSingle();

  if (!existing) {
    await sb.from("threads").insert({
      id: opts.thread_id,
      project_id: opts.project_id,
      user_id: opts.user_id || null,
      title: opts.title || "Nueva conversación"
    });
  }
}

export async function loadThread(project_id: string, thread_id: string, limit = 40) {
  const { data, error } = await sb
    .from("messages")
    .select("id, role, content, created_at")
    .eq("project_id", project_id)
    .eq("thread_id", thread_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  
  // Retornamos en orden cronológico correcto (más antiguo primero)
  return data.reverse();
}

export async function appendMessage(
  project_id: string,
  thread_id: string,
  role: ChatRole,
  content: string
) {
  const { data, error } = await sb
    .from("messages")
    .insert({
      project_id,
      thread_id,
      role,
      content
    })
    .select("id")
    .single();

  if (error) {
    console.error("Fallo de memoria (Syntia Error):", error.message);
  }
  return data?.id;
}