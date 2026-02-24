export class HttpError extends Error {
  status: number;
  payload: any;

  constructor(status: number, payload: any) {
    super(typeof payload?.error === "string" ? payload.error : "HttpError");
    this.status = status;
    this.payload = payload ?? { ok: false, error: "Error" };
  }
}

/**
 * Valida que la petición tenga el token correcto de autorización.
 * Protege a NOVA AGI de accesos no autorizados.
 */
export function requireAuth(header: string | undefined | null, expectedKey: string) {
  if (!expectedKey || expectedKey.length < 16) {
    throw new HttpError(500, { ok: false, error: "Configuración de servidor insegura (llave muy corta o ausente)." });
  }

  const auth = String(header || "").trim();
  if (!auth) {
    throw new HttpError(401, { ok: false, error: "No autorizado. Falta token." });
  }

  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (token !== expectedKey) {
    throw new HttpError(401, { ok: false, error: "No autorizado. Token inválido." });
  }
}