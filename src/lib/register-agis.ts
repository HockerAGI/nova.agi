import { sbAdmin } from "./supabase.js";
import { AGIS } from "./agis.js";

export async function seedAgis() {
  const sb = sbAdmin();

  const rows = AGIS.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.system_prompt.slice(0, 180),
    version: "1.0.0",
    tags: a.tags,
    meta: { level: a.level, parent_id: a.parent_id ?? null, kind: a.kind },
  }));

  const { error } = await sb.from("agis").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(error.message);

  return rows.length;
}