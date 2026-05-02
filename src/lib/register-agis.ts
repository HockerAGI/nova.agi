import { sbAdmin } from "./supabase.js";
import { AGIS } from "./agis.js";

export async function seedAgis(): Promise<number> {
  const sb = sbAdmin();

  const rows = AGIS.map((agi) => ({
    id: agi.id,
    name: agi.name,
    description: agi.mission ?? String(agi.system_prompt ?? "").slice(0, 180),
    version: "1.0.0",
    tags: Array.isArray(agi.tags) ? agi.tags : [],
    meta: {
      key: agi.key,
      level: agi.level,
      parent_id: agi.parent_id ?? null,
      kind: agi.kind,
      status: agi.status ?? "active",
      priority: agi.priority ?? 99,
      owner_area: agi.owner_area ?? null,
      mission: agi.mission ?? null,
      objectives: agi.objectives ?? [],
      functions: agi.functions ?? [],
      limits: agi.limits ?? [],
      allowed_commands: agi.allowed_commands ?? [],
      memory_scope: agi.memory_scope ?? [],
      system_prompt: agi.system_prompt,
      updated_by: "nova.agi",
      registry_version: "agi-registry-v1",
    },
  }));

  const { error } = await sb.from("agis").upsert(rows, { onConflict: "id" });

  if (error) {
    throw new Error(`No se pudieron sembrar las AGIs: ${error.message}`);
  }

  return rows.length;
}
