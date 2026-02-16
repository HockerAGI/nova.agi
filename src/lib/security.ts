import crypto from "node:crypto";

function sortKeysDeep(value: any): any {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeysDeep(value[k]);
    return out;
  }
  return value;
}

export function canonicalJson(value: any): string {
  return JSON.stringify(sortKeysDeep(value ?? {}));
}

/**
 * Firma v2:
 * id|project_id|node_id|command|created_at|canonical(payload)
 */
export function signCommandV2(
  secret: string,
  id: string,
  project_id: string,
  node_id: string,
  command: string,
  payload: any,
  created_at: string
): string {
  const base = [id, project_id, node_id, command, created_at, canonicalJson(payload)].join("|");
  return crypto.createHmac("sha256", secret).update(base).digest("hex");
}