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
  node_id?: string | null;
  severity?: "debug" | "info" | "warn" | "error" | "critical";
  message: string;
  meta?: Record<string, any>;
};

function toLevel(sev?: string): "info" | "warn" | "error" {
  const s = String(sev || "info").toLowerCase();
  if (s === "warn" || s === "warning") return "warn";
  if (s === "error" || s === "critical") return "error";
  return "info";
}

export async function logEvent(e: SynapseEvent) {
  const sb = sbAdmin();
  const level = toLevel(e.severity);
  const data = e.meta && typeof e.meta === "object" ? e.meta : {};

  const { error } = await sb.from("events").insert({
    project_id: e.project_id,
    node_id: e.node_id ?? null,
    level,
    type: e.type,
    message: e.message,
    data,
  });

  const trace = langfuse.trace({ name: `Synapse_${e.type}`, metadata: { project_id: e.project_id } });
  trace.event({
    name: e.message,
    level: level === "error" ? "ERROR" : level === "warn" ? "WARNING" : "DEFAULT",
    input: data,
  });

  await langfuse.flushAsync();

  if (error) throw new Error(error.message);
}