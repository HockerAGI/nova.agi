import "dotenv/config";
import { sbAdmin } from "../lib/supabase.js";
import { AGIS } from "../lib/agis.js";

async function main() {
  const sb = sbAdmin();

  const project_id = process.env.HOCKER_PROJECT_ID || process.env.DEFAULT_PROJECT_ID || "global";
  if (!project_id) throw new Error("Set HOCKER_PROJECT_ID to seed agis");

  console.log(`[+] Iniciando inyección de Conciencia Colmena en proyecto: ${project_id}`);

  // Inyectamos todas las AGIs dinámicamente desde la fuente de verdad (agis.ts)
  for (const agi of AGIS) {
    const { error } = await sb.from("agis").upsert({
      project_id,
      name: agi.name,
      purpose: agi.system_prompt.substring(0, 150) + "...", // Usamos el prompt como purpose
      role: agi.kind,
      status: "active",
      metadata: { level: agi.level, tags: agi.tags, parent_id: agi.parent_id }
    }, { onConflict: "project_id,name" as any });
    
    if (error) {
      console.error(`[-] Fallo al sembrar AGI: ${agi.name}`, error);
      throw error;
    }
    console.log(`  -> AGI Despertada: ${agi.name} (${agi.kind})`);
  }

  console.log("[✓] OK: Matriz de AGIs inyectada exitosamente.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});