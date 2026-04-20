import { sbAdmin } from "./supabase.js";
import { AGIS } from "./agis.js";

export async function seedAgis(): Promise<number> {
  const sb = sbAdmin();

  const rows = AGIS.map((agi) => ({
    id: agi.id,
    name: agi.name,
    description: String(agi.system_prompt ?? "").slice(0, 180),
    version: "1.0.0",
    tags: Array.isArray(agi.tags) ? agi.tags : [],
    meta: {
      level: agi.level,
      parent_id: agi.parent_id ?? null,
      kind: agi.kind,
    },
  }));

  const { error } = await sb.from("agis").upsert(rows, { onConflict: "id" });

  if (error) {
    throw new Error(`No se pudieron sembrar las AGIs: ${error.message}`);
  }

  return rows.length;
}