export type Intent =
  | { action: "PING" }
  | { action: "NODES_LIST" }
  | { action: "AGIS_LIST" }
  | { action: "SUPPLY_PRODUCTS_LIST" }
  | { action: "SUPPLY_ORDERS_LIST" }
  | { action: "DEPLOY_HOCKER_ONE" }
  | { action: "COMMAND_SEND"; params: { node_id: string; command: string; payload?: Record<string, unknown>; project_id?: string } }
  | { action: "UNKNOWN"; reason?: string };

export function ruleIntent(text: string): Intent {
  const t = text.toLowerCase().trim();

  if (t === "ping") return { action: "PING" };
  if (t.includes("lista") && t.includes("nodos")) return { action: "NODES_LIST" };
  if (t.includes("lista") && (t.includes("agi") || t.includes("agis"))) return { action: "AGIS_LIST" };
  if (t.includes("productos")) return { action: "SUPPLY_PRODUCTS_LIST" };
  if (t.includes("ordenes") || t.includes("órdenes") || t.includes("orders")) return { action: "SUPPLY_ORDERS_LIST" };
  if (t.includes("deploy") || t.includes("redeploy") || t.includes("vercel")) return { action: "DEPLOY_HOCKER_ONE" };

  return { action: "UNKNOWN" };
}