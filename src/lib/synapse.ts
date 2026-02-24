import { sbAdmin } from "./supabase.js";
import { Langfuse } from "langfuse-node";
import { config } from "../config.js";

// Inicialización de la observabilidad de eventos de sistema
const langfuse = new Langfuse({
  publicKey: config.langfuse.publicKey,
  secretKey: config.langfuse.secretKey,
  baseUrl: config.langfuse.baseUrl,
});

export type SynapseEvent = {
  project_id: string;
  type: string;          // "chat.user" | "chat.nova" | "execute.request" | "error" | ...
  source?: string;       // "hocker.one" | "api" | "fabric"
  node_id?: string | null;
  severity?: "debug" | "info" | "warn" | "error" | "critical";
  message: string;
  meta?: Record<string, any>;
};

export async function logEvent(e: SynapseEvent) {
  const sb = sbAdmin();

  // 1. Registro Inmutable en HockerChain (Supabase)
  const { error } = await sb.from("events").insert({
    project_id: e.project_id,
    type: e.type,
    message: e.message,
    level: e.severity === "warn" ? "warning" : e.severity === "error" || e.severity === "critical" ? "error" : "info",
    meta: { source: e.source ?? "api", node_id: e.node_id ?? "hocker-fabric", ...e.meta }
  });

  // 2. Trazabilidad Cuántica en Langfuse (Syntia Memory)
  const trace = langfuse.trace({ name: `Synapse_${e.type}`, metadata: { project_id: e.project_id } });
  
  trace.event({
    name: e.message,
    level: e.severity === "error" || e.severity === "critical" ? "ERROR" : e.severity === "warn" ? "WARNING" : "DEFAULT",
    input: e.meta
  });
  
  await langfuse.flushAsync();

  if (error) throw error;
}