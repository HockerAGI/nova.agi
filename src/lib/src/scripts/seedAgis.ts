import "dotenv/config";
import { supabaseAdmin } from "../lib/supabase.js";

type SeedAgi = { name: string; purpose: string };

const CORE: SeedAgi[] = [
  { name: "NOVA", purpose: "Orquestación central (Synapse + ejecución + gobernanza)" },
  { name: "Candy Ads", purpose: "Creatividad y contenido emocional" },
  { name: "Nova Ads", purpose: "Paid media (Meta/TikTok/Google/LinkedIn)" },
  { name: "Numia", purpose: "Finanzas y analítica" },
  { name: "Jurix", purpose: "Legal/KYC/políticas" },
  { name: "Vertx", purpose: "Auditoría, kill-switch, control de riesgo" }
];

async function main() {
  const sb = supabaseAdmin();

  // project “global”: usa tu project_id real
  const project_id = process.env.HOCKER_PROJECT_ID;
  if (!project_id) throw new Error("Set HOCKER_PROJECT_ID to seed agis");

  for (const agi of CORE) {
    const { error } = await sb.from("agis").upsert({
      project_id,
      name: agi.name,
      purpose: agi.purpose,
      status: "active"
    }, { onConflict: "project_id,name" as any });
    if (error) throw error;
  }

  console.log("OK: seeded core AGIs");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});