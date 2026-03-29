import crypto from "node:crypto";
import { config } from "../config.js";
import { sb } from "./supabase.js";
import { signCommand } from "./security.js";

const READONLY_COMMANDS = new Set(["ping", "status", "read_dir", "read_file_head"]);
const SENSITIVE_COMMANDS = new Set([
  "run_sql",
  "shell.exec",
  "fs.write",
  "stripe.charge",
  "meta.send_msg",
  "crypto.transfer",
]);

type EnqueueOptions = {
  project_id: string;
  allow_actions: boolean;
  allow_actions_header: string | null;
  actions: any[];
};

async function getControls(project_id: string): Promise<{ kill_switch: boolean; allow_write: boolean }> {
  const { data } = await sb
    .from("system_controls")
    .select("kill_switch,allow_write")
    .eq("project_id", project_id)
    .eq("id", "global")
    .maybeSingle();

  return {
    kill_switch: Boolean((data as any)?.kill_switch),
    allow_write: Boolean((data as any)?.allow_write),
  };
}

function isCloudTarget(nodeId: string) {
  const nid = String(nodeId || "").trim().toLowerCase();
  const fallback = String(config.actions.fallbackNodeId || "hocker-fabric").trim().toLowerCase();
  return nid === fallback || nid.startsWith("cloud-") || nid.startsWith("trigger-");
}

export async function enqueueActions(opts: EnqueueOptions) {
  const { project_id, allow_actions, allow_actions_header, actions } = opts;

  if (!config.actions.enabled) return { enqueued: [], blocked: [] };
  if (!allow_actions) return { enqueued: [], blocked: actions ?? [] };
  if (config.actions.requireHeader && allow_actions_header !== "1") {
    return { enqueued: [], blocked: actions ?? [] };
  }
  if (!Array.isArray(actions) || actions.length === 0) {
    return { enqueued: [], blocked: [] };
  }

  const controls = await getControls(project_id);
  if (controls.kill_switch) return { enqueued: [], blocked: actions ?? [] };

  const enqueued: any[] = [];
  const blocked: any[] = [];
  let cloudRequiresWakeUp = false;

  for (const act of actions) {
    if (!act || typeof act !== "object" || !act.command) continue;

    const command = String(act.command).trim().toLowerCase();
    const payload = act.payload && typeof act.payload === "object" ? { ...act.payload } : {};
    let target_node_id = String(act.node_id || config.actions.defaultNodeId).trim();

    if (!controls.allow_write && !READONLY_COMMANDS.has(command)) {
      blocked.push({ ...act, reason: "allow_write_off" });
      continue;
    }

    if (target_node_id !== config.actions.fallbackNodeId) {
      const { data: nodeData } = await sb
        .from("nodes")
        .select("status, last_seen_at")
        .eq("id", target_node_id)
        .eq("project_id", project_id)
        .maybeSingle();

      let isOffline = true;
      if (nodeData && nodeData.status === "online" && nodeData.last_seen_at) {
        const lastSeen = new Date(nodeData.last_seen_at).getTime();
        if (Date.now() - lastSeen < 120000) isOffline = false;
      }

      if (isOffline) {
        target_node_id = config.actions.fallbackNodeId;
        (payload as any)._failover_reason = "physical_node_offline";
      }
    }

    const isSensitive = SENSITIVE_COMMANDS.has(command);
    const needs_approval = config.actions.defaultNeedsApproval || isSensitive;
    const status = needs_approval ? "needs_approval" : "queued";

    if (!config.commandHmacSecret) {
      blocked.push({ ...act, reason: "missing_hmac_secret" });
      continue;
    }

    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();
    const signature = signCommand(config.commandHmacSecret, id, project_id, target_node_id, command, payload, created_at);

    const { error } = await sb.from("commands").insert({
      id,
      project_id,
      node_id: target_node_id,
      command,
      payload,
      status,
      needs_approval,
      signature,
      created_at,
    });

    if (error) {
      blocked.push({ ...act, reason: error.message });
      continue;
    }

    enqueued.push({ id, node_id: target_node_id, command, status, needs_approval });

    if (isCloudTarget(target_node_id) && !needs_approval) {
      cloudRequiresWakeUp = true;
    }
  }

  if (cloudRequiresWakeUp && config.hockerOneApiUrl && config.commandHmacSecret) {
    try {
      const dispatchUrl = new URL("/api/commands/dispatch", config.hockerOneApiUrl);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      try {
        const response = await fetch(dispatchUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.commandHmacSecret}`,
          },
          body: JSON.stringify({ project_id }),
          signal: controller.signal,
        });

        if (!response.ok) {
          console.error(`[FABRIC DISPATCH ERROR] ${response.status} ${response.statusText}`);
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch (e: any) {
      console.error("[FABRIC DISPATCH ERROR]", e?.message || e);
    }
  }

  return { enqueued, blocked };
}