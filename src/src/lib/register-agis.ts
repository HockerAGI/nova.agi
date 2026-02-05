import { adminSupabase } from "./supabase.js";

export async function registerDefaultAgis(project_id: string) {
  const sb = adminSupabase();

  const agis = [
    { id: "nova", project_id, name: "NOVA", purpose: "Orquestación y decisión", status: "online" },
    { id: "vertx", project_id, name: "VERTX", purpose: "Auditoría y control", status: "online" },
    { id: "curvewind", project_id, name: "Curvewind", purpose: "Motor creativo/branding", status: "offline" },
    { id: "candy-ads", project_id, name: "Candy Ads", purpose: "Contenido emocional/visual", status: "offline" },
    { id: "pro-ia", project_id, name: "PRO IA", purpose: "Video/producción", status: "offline" },
    { id: "nova-ads", project_id, name: "Nova Ads", purpose: "Gestión Ads (Meta/TikTok/Google)", status: "offline" },
    { id: "numia", project_id, name: "Numia", purpose: "Finanzas/analítica", status: "offline" },
    { id: "jurix", project_id, name: "Jurix", purpose: "Legal/KYC", status: "offline" },
    { id: "trackhok", project_id, name: "Trackhok IA", purpose: "Rastreo predictivo GPS (legal/consentido)", status: "offline" },
    { id: "nexpa", project_id, name: "NEXPA IA", purpose: "Seguridad (solo legal/consentido)", status: "offline" },
    { id: "chido-wins", project_id, name: "Chido Wins", purpose: "Nodo espejo de pruebas", status: "offline" },
    { id: "chido-gerente", project_id, name: "Chido Gerente", purpose: "Operaciones", status: "offline" }
  ];

  await sb.from("agis").upsert(agis);
}