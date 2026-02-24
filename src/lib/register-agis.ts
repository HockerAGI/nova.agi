import { sbAdmin } from "./supabase.js";
import { AGIS } from "./agis.js";

export async function seedAgis(project_id: string) {
  const sb = sbAdmin();

  const rows = AGIS.map((a) => ({
    id: a.id,
    project_id,
    name: a.name,
    role: a.kind,
    status: "offline", // Las AGIs nacen offline hasta que Hostia o NOVA las invocan
    endpoint_url: null,
    metadata: { level: a.level, parent_id: a.parent_id ?? null, tags: a.tags }
  }));

  const { error } = await sb.from("agis").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(error.message);

  return rows.length;
}