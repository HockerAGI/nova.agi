import { randomUUID } from "node:crypto";
import type { AdminSupabase } from "./supabase.js";
import type { JsonObject, MemoryMessage, MemoryThread, Role } from "../types.js";

function asJsonObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function normalizeThread(row: Record<string, unknown>): MemoryThread {
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    user_id: row.user_id ? String(row.user_id) : null,
    title: row.title ? String(row.title) : null,
    created_at: String(row.created_at),
    summary: row.summary ? String(row.summary) : null,
    meta: asJsonObject(row.meta),
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function normalizeMessage(row: Record<string, unknown>): MemoryMessage {
  const role = String(row.role ?? "assistant") as Role;
  return {
    id: String(row.id),
    thread_id: String(row.thread_id),
    project_id: String(row.project_id),
    role,
    content: String(row.content ?? ""),
    created_at: String(row.created_at),
    meta: asJsonObject(row.meta),
  };
}

function dbRole(role: Role): "system" | "user" | "assistant" | "nova" {
  if (role === "system") return "system";
  if (role === "user") return "user";
  if (role === "nova") return "nova";
  return "assistant";
}

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
    .from("nova_threads")
    .upsert(
      {
        id,
        project_id,
        user_id: user_id ?? null,
        title: title ?? null,
        created_at: now,
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "No se pudo crear/leer el thread.");
  }

  return normalizeThread(data as Record<string, unknown>);
}

export async function appendMessage(
  sb: AdminSupabase,
  thread_id: string,
  project_id: string,
  role: Role,
  content: string,
  _meta: JsonObject = {},
): Promise<MemoryMessage> {
  const now = new Date().toISOString();

  const { data, error } = await sb
    .from("nova_messages")
    .insert({
      id: randomUUID(),
      thread_id,
      project_id,
      role: dbRole(role),
      content,
      created_at: now,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "No se pudo guardar el mensaje.");
  }

  return normalizeMessage(data as Record<string, unknown>);
}

export async function loadThreadMessages(
  sb: AdminSupabase,
  thread_id: string,
  project_id: string,
  limit = 20,
): Promise<MemoryMessage[]> {
  const { data, error } = await sb
    .from("nova_messages")
    .select("*")
    .eq("thread_id", thread_id)
    .eq("project_id", project_id)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => normalizeMessage(row as Record<string, unknown>));
}