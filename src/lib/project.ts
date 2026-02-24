export function normalizeProjectId(v: string): string {
  const s = (v || "global").trim().toLowerCase();
  return s.replace(/[^a-z0-9-_]/g, "-").slice(0, 64) || "global";
}

export function defaultProjectId(): string {
  return normalizeProjectId(process.env.DEFAULT_PROJECT_ID ?? "global");
}

export function defaultNodeId(): string {
  // ACTUALIZADO: Apuntando a la infraestructura Zero-Trust por defecto, no a un nodo físico obsoleto.
  return (process.env.DEFAULT_NODE_ID ?? "hocker-fabric").trim();
}