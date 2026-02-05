export type NovaAction =
  | { type: "reply"; message: string }
  | { type: "enqueue_command"; node_id: string; command: string; payload: any; needs_approval?: boolean; message?: string }
  | { type: "redeploy_vercel"; message?: string }
  | { type: "register_agis"; message?: string };

export function interpretRules(text: string): NovaAction {
  const t = (text || "").toLowerCase();

  if (t.includes("redeploy") || t.includes("desplegar") || t.includes("deploy")) return { type: "redeploy_vercel" };
  if (t.includes("registrar agis") || t.includes("seed agis")) return { type: "register_agis" };

  // comandos “humanos” (ejemplo)
  if (t.startsWith("status")) {
    return { type: "enqueue_command", node_id: "node-hocker-01", command: "status", payload: {}, needs_approval: false };
  }

  return { type: "reply", message: "Listo. Dime qué quieres que haga (ej: 'status', 'redeploy', 'registrar AGIs')." };
}