import { sbAdmin } from "./supabase";
import { normalizeProjectId } from "./project";

type AgiDef = {
  id: string;
  name: string;
  description: string;
  endpoint_url?: string;
};

const DEFAULT_AGIS: AgiDef[] = [
  { id: "nova", name: "NOVA", description: "Orquestación central del ecosistema" },
  { id: "syntia", name: "SYNTIA", description: "AGI de síntesis/arquitectura y flujos" },
  { id: "revia", name: "REVIA", description: "AGI de afiliados/automatización comercial" },
  { id: "vertx", name: "VERTX", description: "Auditoría, reglas, compliance, control plane" },
  { id: "curvewind", name: "CURVEWIND", description: "Motor creativo/predicción y scoring" },
  { id: "hostia", name: "HOSTIA", description: "Infra/DevOps/Hosting y despliegues" },
  { id: "nexpa", name: "NEXPA", description: "Seguridad/activación remota y control" },
  { id: "trackhok", name: "TRACKHOK", description: "Rastreo predictivo GPS" },
  { id: "numia", name: "NUMIA", description: "Finanzas/analytics" },
  { id: "jurix", name: "JURIX", description: "Legal/KYC/Compliance" },
  { id: "candy-ads", name: "CANDY ADS", description: "Creativa emocional + contenido" },
  { id: "pro-ia", name: "PRO IA", description: "Generación de video y producción" },
  { id: "nova-ads", name: "NOVA ADS", description: "Ads manager invisible (Meta/TikTok/Google)" },
  { id: "chido-wins", name: "CHIDO WINS", description: "Apuestas inteligentes (execution)" },
  { id: "chido-gerente", name: "CHIDO GERENTE", description: "Operaciones de apuestas" }
];

export async function registerDefaultAgis(projectId: string) {
  const sb = sbAdmin();
  const project_id = normalizeProjectId(projectId);

  const rows = DEFAULT_AGIS.map((a) => ({
    id: a.id,
    project_id,
    name: a.name,
    description: a.description,
    status: "offline",
    endpoint_url: a.endpoint_url ?? null,
    meta: {}
  }));

  const r = await sb.from("agis").upsert(rows, { onConflict: "id" });
  if (r.error) throw new Error(r.error.message);
}