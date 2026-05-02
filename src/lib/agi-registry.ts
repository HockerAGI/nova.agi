import type { AdminSupabase } from "./supabase.js";
import { pickAgi } from "./agis.js";
import type { AgiDef, AgiKey, Intent, JsonObject, JsonValue } from "../types.js";

type RegistrySource = "supabase" | "local_fallback";

type RegistryRow = {
  id?: string;
  name?: string | null;
  description?: string | null;
  version?: string | null;
  tags?: string[] | null;
  meta?: JsonObject | null;
};

export type RegistryDecision = {
  agi: AgiDef;
  source: RegistrySource;
};

function asMeta(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function asString(value: JsonValue | undefined, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asNumber(value: JsonValue | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function asStatus(value: JsonValue | undefined): "active" | "guarded" | "planned" {
  if (value === "guarded") return "guarded";
  if (value === "planned") return "planned";
  return "active";
}

function toRegistryAgi(row: RegistryRow, fallback: AgiDef): AgiDef {
  const meta = asMeta(row.meta);

  return {
    ...fallback,
    id: row.id || fallback.id,
    key: asString(meta.key, fallback.key) as AgiKey,
    name: row.name || fallback.name,
    kind: asString(meta.kind, fallback.kind),
    level: asNumber(meta.level, fallback.level),
    parent_id: typeof meta.parent_id === "string" ? meta.parent_id : fallback.parent_id,
    tags: Array.isArray(row.tags) ? row.tags : fallback.tags,
    system_prompt: asString(meta.system_prompt, fallback.system_prompt),

    mission: asString(meta.mission, fallback.mission ?? row.description ?? ""),
    objectives: asStringArray(meta.objectives),
    functions: asStringArray(meta.functions),
    limits: asStringArray(meta.limits),
    allowed_commands: asStringArray(meta.allowed_commands),
    status: asStatus(meta.status),
    priority: asNumber(meta.priority, fallback.priority ?? 99),
    owner_area: asString(meta.owner_area, fallback.owner_area ?? ""),
    memory_scope: asStringArray(meta.memory_scope),
  };
}

export async function pickAgiFromRegistry(
  sb: AdminSupabase,
  intent: Intent,
  message: string,
): Promise<RegistryDecision> {
  const fallback = pickAgi(intent, message);

  try {
    const { data, error } = await sb
      .from("agis")
      .select("id,name,description,version,tags,meta")
      .eq("id", fallback.id)
      .maybeSingle();

    if (error || !data) {
      return {
        agi: fallback,
        source: "local_fallback",
      };
    }

    return {
      agi: toRegistryAgi(data as RegistryRow, fallback),
      source: "supabase",
    };
  } catch {
    return {
      agi: fallback,
      source: "local_fallback",
    };
  }
}

function listBlock(title: string, items: string[] | undefined): string {
  const clean = Array.isArray(items) ? items.filter(Boolean).slice(0, 8) : [];
  if (clean.length === 0) return `${title}: sin datos registrados.`;

  return `${title}:\n${clean.map((item) => `- ${item}`).join("\n")}`;
}

export function registryPromptBlock(agi: AgiDef): string {
  return [
    "Ficha viva del AGI Registry V1:",
    `AGI: ${agi.name}`,
    `ID: ${agi.id}`,
    `Tipo: ${agi.kind}`,
    `Estado: ${agi.status ?? "active"}`,
    `Área responsable: ${agi.owner_area ?? "No definida"}`,
    `Misión: ${agi.mission ?? "Sin misión registrada."}`,
    listBlock("Objetivos", agi.objectives),
    listBlock("Funciones", agi.functions),
    listBlock("Límites", agi.limits),
    listBlock("Comandos permitidos para esta AGI", agi.allowed_commands),
    "Respeta estos límites al responder. NOVA siempre conserva el mando público.",
  ].join("\n");
}
