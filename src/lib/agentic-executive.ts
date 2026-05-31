import { randomUUID } from "node:crypto";
import { signCommand } from "./security.js";
export const AGENTIC_EXEC_VERSION = "2.3.1-STABLE";

export async function executeAutonomousAction(actionType: string, payload: any, targetNode = "hocker-node-1") {
  const timestamp = new Date().toISOString();
  const id = randomUUID();
  const project_id = process.env.HOCKER_PROJECT_ID || "hocker-one";
  const secret = process.env.HOCKER_COMMAND_HMAC_SECRET!;

  // Firma de 7 argumentos requerida por el protocolo de seguridad Hocker
  const signature = signCommand(
    secret, 
    id, 
    project_id, 
    targetNode, 
    actionType, 
    payload, 
    timestamp
  );

  console.log(`[AGENTIC] Acción firmada y despachada: ${actionType}`);
  
  return {
    status: "dispatched",
    id,
    action: actionType,
    node: targetNode,
    signature,
    ts: timestamp
  };
}
