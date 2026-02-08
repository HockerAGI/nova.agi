import crypto from "node:crypto";
import { sbAdmin } from "./supabase.js";
import type { NovaDbMessage, DbMessageRole } from "../types.js";

export function newThreadId() {
  return crypto.randomUUID();
}

export async function upsertThread(project_id: string, thread_id: string, title?: string | null) {
  const sb = sbAdmin();
  await sb.from("nova_threads").upsert(
    {
      id: thread_id,
      project_id,
      title: title ?? null,
      updated_at: new Date().toISOString()
    },
    { onConflict: "id" }
  );
}

export async function appendMessage(
  project_id: string,
  thread_id: string,
  role: DbMessageRole,
  content: string
) {
  const sb = sbAdmin();
  await sb.from("nova_messages").insert({
    project_id,
    thread_id,
    role,
    content
  });
}

export async function loadRecentMessages(project_id: string, thread_id: string, limit = 25): Promise<NovaDbMessage[]> {
  const sb = sbAdmin();
  const { data, error } = await sb
    .from("nova_messages")
    .select("id, project_id, thread_id, role, content, created_at")
    .eq("project_id", project_id)
    .eq("thread_id", thread_id)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error || !data) return [];
  return data as any;
}