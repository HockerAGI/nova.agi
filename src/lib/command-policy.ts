import type { ActionItem, JsonObject } from "../types.js";

export const CLOUD_COMMAND_NODE_ID =
  String(process.env.CLOUD_COMMAND_NODE_ID ?? "cloud-hocker-one").trim() || "cloud-hocker-one";

export const LOCAL_COMMAND_NODE_ID =
  String(
    process.env.DEFAULT_COMMAND_NODE_ID ??
      process.env.DEFAULT_NODE_ID ??
      "hocker-node-1",
  ).trim() || "hocker-node-1";

export const READONLY_COMMANDS = [
  "status",
  "read_dir",
  "read_file_head",
  "github.get_repo",
  "github.list_tree",
  "github.read_file",
] as const;

export const WRITE_COMMANDS = [
  "shell.exec",
  "fs.write",
  "github.create_branch",
  "github.upsert_file",
  "github.create_pr",
] as const;

const READONLY_SET = new Set<string>(READONLY_COMMANDS);
const WRITE_SET = new Set<string>(WRITE_COMMANDS);
const SUPPORTED_SET = new Set<string>([...READONLY_COMMANDS, ...WRITE_COMMANDS]);

function asJsonObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function asCommand(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isSupportedCommand(command: string): boolean {
  return SUPPORTED_SET.has(command);
}

export function isReadonlyCommand(command: string): boolean {
  return READONLY_SET.has(command);
}

export function isWriteCommand(command: string): boolean {
  return WRITE_SET.has(command);
}

export function routeNodeForCommand(command: string): string {
  if (command.startsWith("github.")) return CLOUD_COMMAND_NODE_ID;
  return LOCAL_COMMAND_NODE_ID;
}

export function sanitizeNovaAction(value: unknown): ActionItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const row = value as Record<string, unknown>;
  const command = asCommand(row.command);

  if (!command || !isSupportedCommand(command)) {
    return null;
  }

  const payload = asJsonObject(row.payload);
  const node_id = routeNodeForCommand(command);

  return {
    node_id,
    command,
    payload,
    needs_approval: isWriteCommand(command) || row.needs_approval === true,
  };
}

export function summarizeSupportedCommands(): string {
  return [
    `Lectura: ${READONLY_COMMANDS.join(", ")}`,
    `Escritura/aprobación: ${WRITE_COMMANDS.join(", ")}`,
    `Ruta GitHub: ${CLOUD_COMMAND_NODE_ID}`,
    `Ruta local/sandbox: ${LOCAL_COMMAND_NODE_ID}`,
  ].join("\\n");
}
