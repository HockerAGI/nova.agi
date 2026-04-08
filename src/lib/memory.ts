import crypto from "node:crypto";
import { sb } from "./supabase.js";
import type { ChatRole } from "../types.js";

export function toChatRole(r: string): ChatRole {
  const s = String(r || "").trim().toLowerCase();
  if (s === "system" || s === "user" || s === "assistant") return s as ChatRole;
  return "assistant";
}

export async function ensureThread(opts: { project_id: string; thread_id: string }) {
  const thread_id = String(opts.thread_id || "").trim();
  if (!thread_id) throw new Error("thread_id requerido");

  // 🔍 Buscar correctamente por thread_id
  const { data, error } = await sb
    .from("nova_threads")
    .select("id")
    .eq("project_id", opts.project_id)
    .eq("thread_id", thread_id)
    .maybeSingle();

  if (error) throw new Error(error.message);

  // 🚀 Si no existe, crear correctamente
  if (!data?.id) {
    const { error: insertErr } = await sb.from("nova_threads").insert({
      id: crypto.randomUUID(),        // PK real
      project_id: opts.project_id,
      thread_id: thread_id,           // 🔥 FIX CLAVE
      created_at: new Date().toISOString(),
    });

    if (insertErr) {
      throw new Error(`ensureThread failed: ${insertErr.message}`);
    }
  }
}

export async function loadThread(
  project_id: string,
  thread_id: string,
  limit = 40
) {
  const { data, error } = await sb
    .from("nova_messages")
    .select("id, role, content, created_at")
    .eq("project_id", project_id)
    .eq("thread_id", thread_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as {
    id: string;
    role: string;
    content: string;
    created_at: string;
  }[]).reverse();
}

export async function appendMessage(
  project_id: string,
  thread_id: string,
  role: ChatRole,
  content: string
) {
  const id = crypto.randomUUID();

  const { error } = await sb.from("nova_messages").insert({
    id,
    project_id,
    thread_id,
    role,
    content,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("Memoria NOVA (DB) falló:", error.message);
    return null;
  }

  return id;
}