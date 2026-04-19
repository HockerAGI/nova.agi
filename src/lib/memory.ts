import type { AdminSupabase } from "./supabase.js";
import type { JsonObject, MemoryMessage, MemoryThread, Role } from "../types.js";

function asJsonObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

export async function ensureThread(
  sb: AdminSupabase,
  project_id: string,
  thread_id: string | null | undefined,
  user_id: string | null | undefined,
  title?: string,
): Promise<MemoryThread> {
  const now = new Date().toISOString();

  if (thread_id) {
    const { data: existing, error: existingErr } = await sb
      .from("nova_threads")
      .select("*")
      .eq("project_id", project_id)
      .eq("id", thread_id)
      .maybeSingle();

    if (existingErr) throw new Error(existingErr.message);
    if (existing) {
      return {
        ...(existing as MemoryThread),
        meta: asJsonObject((existing as MemoryThread).meta),
      };
    }
  }

  const { data, error } = await sb
    .from("nova_threads")
    .insert({
      project_id,
      user_id: user_id ?? null,
      title: title ?? null,
      summary: null,
      meta: {},
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message || "No se pudo crear el thread.");

  return {
    ...(data as MemoryThread),
    meta: asJsonObject((data as MemoryThread).meta),
  };
}

export async function appendMessage(
  sb: AdminSupabase,
  thread_id: string,
  project_id: string,
  role: Role,
  content: string,
  meta: JsonObject = {},
): Promise<MemoryMessage> {
  const { data, error } = await sb
    .from("nova_messages")
    .insert({
      project_id,
      thread_id,
      role,
      content,
      meta,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message || "No se pudo guardar el mensaje.");

  await sb
    .from("nova_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", thread_id)
    .eq("project_id", project_id);

  return {
    ...(data as MemoryMessage),
    meta: asJsonObject((data as MemoryMessage).meta),
  };
}

export async function loadThreadMessages(
  sb: AdminSupabase,
  thread_id: string,
  project_id: string,
  limit = 24,
): Promise<MemoryMessage[]> {
  const { data, error } = await sb
    .from("nova_messages")
    .select("*")
    .eq("thread_id", thread_id)
    .eq("project_id", project_id)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    ...(row as MemoryMessage),
    meta: asJsonObject((row as MemoryMessage).meta),
  }));
}