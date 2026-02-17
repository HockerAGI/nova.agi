export class HttpError extends Error {
  status: number;
  payload: any;
  constructor(status: number, payload: any) {
    super(typeof payload?.error === "string" ? payload.error : "http_error");
    this.status = status;
    this.payload = payload;
  }
}

export function bearerToken(authorization?: string | null): string | null {
  if (!authorization) return null;
  const s = String(authorization).trim();
  if (!s) return null;
  const parts = s.split(/\s+/);
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer" && parts[1]) return parts[1];
  return null;
}

// Auth duro para orquestación (hocker.one -> nova.agi)
export function requireAuth(authorization: string | undefined, expectedKey: string) {
  const token = bearerToken(authorization);
  if (!token) throw new HttpError(401, { ok: false, error: "Missing Authorization: Bearer <key>" });
  if (token !== expectedKey) throw new HttpError(403, { ok: false, error: "Invalid orchestrator key" });
}

// Compat con el nombre previo
export const requireOrchestratorAuth = (req: { headers: Record<string, any> }, expectedKey?: string) => {
  const auth = (req as any)?.headers?.authorization ?? (req as any)?.headers?.Authorization;
  if (!expectedKey) throw new HttpError(500, { ok: false, error: "Server misconfigured (missing orchestrator key)" });
  requireAuth(String(auth ?? ""), expectedKey);
};