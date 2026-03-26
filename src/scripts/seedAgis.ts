import "dotenv/config";
import { sbAdmin } from "../lib/supabase.js";
import { AGIS } from "../lib/agis.js";

async function main() {
  const sb = sbAdmin();

  console.log("[+] Iniciando seed de AGIs globales");

  for (const agi of AGIS) {
    const { error } = await sb.from("agis").upsert(
      {
        id: agi.id,
        name: agi.name,
        description: agi.system_prompt.slice(0, 180),
        version: "1.0.0",
        tags: agi.tags,
        meta: { level: agi.level, parent_id: agi.parent_id ?? null, kind: agi.kind },
      },
      { onConflict: "id" as any }
    );

    if (error) throw new Error(`Seed AGI failed (${agi.id}): ${error.message}`);
    console.log(`  -> OK: ${agi.name}`);
  }

  console.log("[✓] OK: AGIs sembradas.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});