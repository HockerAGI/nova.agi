import { sbAdmin } from "./supabase.js";
import { getLangfuseClient } from "./telemetry.js";

export type SynapseEvent = {
  project_id: string;
  type: string;
  node_id?: string | null;
  severity?: "debug" | "info" | "warn" | "error" | "critical";
  message: string;
  meta?: Record<string, unknown>;
};

function toLevel(sev?: string): "info" | "warn" | "error" {
  const s = String(sev || "info").toLowerCase();
  if (s === "warn" || s === "warning") return "warn";
  if (s === "error" || s === "critical") return "error";
  return "info";
}

function toLangfuseLevel(level: "info" | "warn" | "error"): "DEFAULT" | "WARNING" | "ERROR" {
  if (level === "error") return "ERROR";
  if (level === "warn") return "WARNING";
  return "DEFAULT";
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

  const langfuse = getLangfuseClient();

  if (langfuse) {
    try {
      const trace = langfuse.trace({
        name: `Synapse_${e.type}`,
        metadata: {
          project_id: e.project_id,
          node_id: e.node_id ?? null,
          severity: e.severity ?? "info",
        },
      });

      trace.event({
        name: e.message,
        level: toLangfuseLevel(level),
        input: data,
      });

      await langfuse.flushAsync();
    } catch (telemetryError) {
      console.warn("Langfuse trace falló, pero el evento principal sigue vivo.", telemetryError);
    }
  }

  if (error) {
    throw new Error(error.message);
  }
}