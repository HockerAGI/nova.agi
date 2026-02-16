import crypto from "node:crypto";
import { supabase } from "./supabase.js";

export type NovaDbMessage = {
  id: string;
  project_id: string;
  thread_id: string;
  role: "system" | "user" | "assistant";
  content: string;
  created_at: string;
};

function nowIso() {
  return new Date().toISOString();
}

function looksLikeMissingColumn(msg: string) {
  return msg.toLowerCase().includes("updated_at") && msg.toLowerCase().includes("column");
}

function looksLikeMissingTable(msg: string) {
  const m = msg.toLowerCase();
  return m.includes("does not exist") || m.includes("relation") || m.includes("table");
}

export async function upsertThread(project_id: string, thread_id: string) {
  const t = nowIso();

  // Intento 1: con updated_at (si ya migraste)
  try {
    const { error } = await supabase.from("nova_threads").upsert(
      {
        id: thread_id,
        project_id,
        updated_at: t
      },
      { onConflict: "id" }
    );
    if (!error) return;
    throw error;
  } catch (e: any) {
    const msg = String(e?.message || e);

    // Intento 2: si aún no existe updated_at, reintenta sin eso
    if (looksLikeMissingColumn(msg)) {
      try {
        await supabase.from("nova_threads").upsert(
          {
            id: thread_id,
            project_id
          },
          { onConflict: "id" }
        );
        return;
      } catch {
        return; // best-effort
      }
    }

    // Si no existe tabla todavía, no rompemos
    if (looksLikeMissingTable(msg)) return;

    // Otros errores: igual no tumbamos, pero se puede ver en logs
    return;
  }
}

export async function appendMessage(project_id: string, thread_id: string, role: NovaDbMessage["role"], content: string) {
  try {
    await supabase.from("nova_messages").insert({
      id: crypto.randomUUID(),
      project_id,
      thread_id,
      role,
      content
    });
  } catch {
    // best-effort (si aún no está la tabla, no tronamos)
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

    if (error) return [];
    return (data as any) ?? [];
  } catch {
    return [];
  }
}