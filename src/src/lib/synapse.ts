import { sbAdmin } from "./supabase.js";
import { Langfuse } from "langfuse-node";
import { config } from "../config.js";

const langfuse = new Langfuse({
  publicKey: config.langfuse.publicKey,
  secretKey: config.langfuse.secretKey,
  baseUrl: config.langfuse.baseUrl,
});

export type SynapseEvent = {
  project_id: string;
  type: string;          
  source?: string;       
  node_id?: string | null;
  severity?: "debug" | "info" | "warn" | "error" | "critical";
  message: string;
  meta?: Record<string, any>;
};

export async function logEvent(e: SynapseEvent) {
  const sb = sbAdmin();

  // Determinación dinámica: Si no especificas, asume tu nodo físico local.
  const targetNode = e.node_id ?? process.env.DEFAULT_NODE_ID ?? "hocker-node-1";

  const { error } = await sb.from("events").insert({
    project_id: e.project_id,
    type: e.type,
    message: e.message,
    level: e.severity === "warn" ? "warning" : e.severity === "error" || e.severity === "critical" ? "error" : "info",
    meta: { source: e.source ?? "api", node_id: targetNode, ...e.meta }
  });

  const trace = langfuse.trace({ name: `Synapse_${e.type}`, metadata: { project_id: e.project_id } });
  
  trace.event({
    name: e.message,
    level: e.severity === "error" || e.severity === "critical" ? "ERROR" : e.severity === "warn" ? "WARNING" : "DEFAULT",
    input: e.meta
  });
  
  await langfuse.flushAsync();

  if (error) throw error;
}