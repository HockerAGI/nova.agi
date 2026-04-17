import { randomUUID } from "node:crypto";
import type { AdminSupabase } from "./supabase.js";
import type { JsonObject, MemoryMessage, MemoryThread, Role } from "../types.js";

export async function ensureThread(
  sb: AdminSupabase,
  project_id: string,
  thread_id: string | null | undefined,
  user_id: string | null | undefined,
  title?: string,
): Promise<MemoryThread> {
  const now = new Date().toISOString();
  const id = thread_id?.trim() || randomUUID();

  const { data, error } = await sb
    .from("threads")
    .upsert(
      {
        id,
        project_id,
        user_id: user_id ?? null,
        title: title ?? null,
        summary: null,
        meta: {},
        created_at: now,
        updated_at: now
      },
      { onConflict: "id" }
    )
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message || "No se pudo crear/leer el thread.");
  return data as MemoryThread;
}

export async function appendMessage(
  sb: AdminSupabase,
  thread_id: string,
  project_id: string,
  role: Role,
  content: string,
  meta: JsonObject = {},
): Promise<MemoryMessage> {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("messages")
    .insert({
      id: randomUUID(),
      thread_id,
      project_id,
      role,
      content,
      meta,
      created_at: now
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message || "No se pudo guardar el mensaje.");
  return data as MemoryMessage;
}

export async function loadThreadMessages(
  sb: AdminSupabase,
  thread_id: string,
  project_id: string,
  limit = 20,
): Promise<MemoryMessage[]> {
  const { data, error } = await sb
    .from("messages")
    .select("*")
    .eq("thread_id", thread_id)
    .eq("project_id", project_id)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as MemoryMessage[];
}