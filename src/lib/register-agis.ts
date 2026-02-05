import { sbAdmin } from "./supabase.js";

type AgiDef = { id: string; name: string; type: string; endpoint?: string; meta?: any };

const DEFAULT_AGIS: AgiDef[] = [
  { id: "nova", name: "NOVA", type: "orchestrator" },
  { id: "syntia", name: "SYNTIA", type: "strategy" },
  { id: "revia", name: "REVIA", type: "affiliate" },
  { id: "vertx", name: "VERTX", type: "audit" },
  { id: "curvewind", name: "CURVEWIND", type: "creative" },
  { id: "hostia", name: "HOSTIA", type: "infra" },
  { id: "nexpa", name: "NEXPA", type: "security" },
  { id: "numia", name: "NUMIA", type: "finance" },
  { id: "jurix", name: "JURIX", type: "legal" },
  { id: "candy-ads", name: "CANDY ADS", type: "content" },
  { id: "pro-ia", name: "PRO IA", type: "video" },
  { id: "nova-ads", name: "NOVA ADS", type: "ads" },
  { id: "trackhok", name: "TRACKHOK", type: "tracking" },
  { id: "chido-wins", name: "CHIDO WINS", type: "betting" },
  { id: "chido-gerente", name: "CHIDO GERENTE", type: "ops" }
];

export async function registerDefaultAgis(project_id: string) {
  const sb = sbAdmin();

  // asegura proyecto
  await sb.from("projects").upsert({ id: project_id, name: project_id.toUpperCase() });

  const rows = DEFAULT_AGIS.map((a) => ({
    id: `${project_id}:${a.id}`,
    project_id,
    name: a.name,
    type: a.type,
    status: "offline",
    endpoint: a.endpoint ?? null,
    meta: a.meta ?? {}
  }));

  await sb.from("agis").upsert(rows, { onConflict: "id" });
}