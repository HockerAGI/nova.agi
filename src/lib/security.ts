import crypto from "node:crypto";

/**
 * Ordena las llaves de un objeto de forma profunda para garantizar
 * que el JSON.stringify siempre produzca exactamente el mismo string,
 * sin importar el orden en que se definieron las propiedades.
 */
function sortKeysDeep(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(sortKeysDeep);
  }
  if (obj !== null && typeof obj === "object") {
    return Object.keys(obj)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeysDeep(obj[key]);
        return acc;
      }, {} as Record<string, any>);
  }
  return obj;
}

/**
 * Genera la firma criptográfica (Protocolo AEGIS/VERTX) para un comando.
 * Debe coincidir bit a bit con la validación en Hocker One.
 */
export function signCommand(
  secret: string,
  id: string,
  project_id: string,
  node_id: string,
  command: string,
  payload: any,
  created_at: string
): string {
  const sortedPayload = sortKeysDeep(payload || {});
  const payloadStr = JSON.stringify(sortedPayload);
  
  // Matriz de integridad estricta
  const data = `${id}|${project_id}|${node_id}|${command}|${payloadStr}|${created_at}`;
  
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}