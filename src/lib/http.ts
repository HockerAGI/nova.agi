import { config } from "../config.js";

export function getOrchestratorKey(req: any): string {
  const auth = String(req.headers?.authorization ?? "");
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return String(req.headers?.["x-hocker-key"] ?? "").trim();
}

export function requireOrchestratorAuth(req: any) {
  const key = getOrchestratorKey(req);
  if (!key) return { ok: false as const, status: 401, error: "Missing auth (Bearer or x-hocker-key)" };
  if (key !== config.orchestratorKey) return { ok: false as const, status: 403, error: "Invalid orchestrator key" };
  return { ok: true as const };
}

export function normalizeProjectId(pid: any, fallback: string) {
  const s = String(pid ?? "").trim();
  return s ? s : fallback;
}

export function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}