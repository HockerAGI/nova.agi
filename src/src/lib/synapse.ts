import { supabaseAdmin } from "./supabase.js";
import { isHotMode } from "./memory.js";

export type SynapseEvent = {
  project_id: string;
  type: string;          // "chat.user" | "chat.nova" | "execute.request" | "execute.plan" | "error" | ...
  source?: string;       // "hocker.one" | "api" | "agent"
  node_id?: string | null;
  severity?: "debug" | "info" | "warn" | "error";
  message: string;
  meta?: Record<string, any>;
};

export async function logEvent(e: SynapseEvent) {
  const sb = supabaseAdmin();
  const hot = await isHotMode();

  // En hot mode puedes decidir no escribir eventos (aquí: sí escribe SOLO errores)
  if (hot && e.severity !== "error") return { skipped: true };

  const { error } = await sb.from("events").insert({
    project_id: e.project_id,
    type: e.type,
    message: e.message,
    meta: { source: e.source ?? "api", node_id: e.node_id ?? null, ...e.meta }
  });
  if (error) throw error;
}