/**
 * NOVA AGI — MCP Tool Calling Integration
 *
 * Bridges NOVA's chat flow to the MCP registry while preserving the Hocker
 * ONE Owner Gate. Proven read-only calls may execute directly; every mutation
 * is returned as a signed approval draft and is never executed by nova.agi.
 */

import { getMcpRegistry } from "./mcp/mcp-registry.js";
import type { McpToolResult } from "./mcp/mcp-connector.js";

const MAX_TOOL_CALLS = 8;
const MAX_TOOL_ARGS_BYTES = 16 * 1024;
const SAFE_TOOL_NAME = /^[a-z0-9_.:-]+$/i;

const READ_ONLY_TOOL_PATTERNS = [
  /^supabase\.(table\.select|table\.count|schema\.list)$/,
  /^github\.(get_repository|list_tree|get_file_contents|list_pull_requests|list_issues)$/,
  /^github\.(repo\.get|repo\.list_tree|repo\.read_file|repo\.list_prs|repo\.list_issues)$/,
  /^vercel\.(project\.list|project\.get|deployment\.list|deployment\.get|env\.list)$/,
  /^openai\.(embed\.create|moderate|model\.list|chat\.structured)$/,
];

export type ParsedToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

export type ToolExecutionResult = {
  id: string;
  name: string;
  result: McpToolResult;
  executed: boolean;
  needsApproval: boolean;
};

export type McpChatIntegration = {
  toolsAvailable: number;
  toolCallsParsed: number;
  toolCallsExecuted: number;
  toolCallsDeferred: number;
  results: ToolExecutionResult[];
  toolPromptBlock: string;
};

export function isReadOnlyTool(qualifiedName: string): boolean {
  return READ_ONLY_TOOL_PATTERNS.some((pattern) => pattern.test(qualifiedName));
}

export function parseToolCallsFromReply(reply: string): ParsedToolCall[] {
  const clean = String(reply ?? "").trim();
  if (!clean) return [];

  const calls: ParsedToolCall[] = [];
  const push = (raw: unknown) => {
    if (calls.length >= MAX_TOOL_CALLS) return;
    const call = normalizeToolCall(raw);
    if (call) calls.push(call);
  };

  try {
    const parsed = JSON.parse(clean) as Record<string, unknown>;
    if (Array.isArray(parsed.tool_calls)) {
      for (const item of parsed.tool_calls) push(item);
    }
    if (calls.length > 0) return calls;
  } catch {
    // Not a JSON envelope; continue with delimited blocks.
  }

  const blockPattern = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
  let match: RegExpExecArray | null;
  while (calls.length < MAX_TOOL_CALLS && (match = blockPattern.exec(clean)) !== null) {
    try {
      const blockContent = match[1];
      if (blockContent) push(JSON.parse(blockContent.trim()));
    } catch {
      // Skip malformed tool blocks.
    }
  }
  if (calls.length > 0) return calls;

  const jsonBlockPattern = /\{[^{}]*"tool"\s*:\s*"[^"]+"[^{}]*\}/g;
  while (calls.length < MAX_TOOL_CALLS && (match = jsonBlockPattern.exec(clean)) !== null) {
    try {
      push(JSON.parse(match[0]));
    } catch {
      // Skip malformed inline blocks.
    }
  }

  return calls;
}

function normalizeToolCall(raw: unknown): ParsedToolCall | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const name = String(obj.name ?? obj.tool ?? obj.function ?? "").trim();
  if (!name || !name.includes(".") || name.length > 180 || !SAFE_TOOL_NAME.test(name)) {
    return null;
  }

  const rawArgs = obj.args ?? obj.arguments ?? obj.input ?? {};
  const args = rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)
    ? rawArgs as Record<string, unknown>
    : {};

  if (Buffer.byteLength(JSON.stringify(args), "utf8") > MAX_TOOL_ARGS_BYTES) {
    return null;
  }

  const id = String(obj.id ?? `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
    .trim()
    .slice(0, 160);

  return { id, name, args };
}

function buildOwnerGateDraft(call: ParsedToolCall): Record<string, unknown> {
  const separator = call.name.indexOf(".");
  const provider = separator > 0 ? call.name.slice(0, separator) : "unknown";
  const tool = separator > 0 ? call.name.slice(separator + 1) : call.name;

  return {
    action_type: "mcp.execute",
    tool_key: "mcp",
    provider,
    tool,
    args: call.args,
    requires_approval: true,
    execution_target: "hocker.one.owner-gate",
  };
}

export async function executeToolCalls(
  calls: ParsedToolCall[],
  opts: { allowActions: boolean },
): Promise<ToolExecutionResult[]> {
  const registry = getMcpRegistry();
  const results: ToolExecutionResult[] = [];

  for (const call of calls.slice(0, MAX_TOOL_CALLS)) {
    const readOnly = isReadOnlyTool(call.name);

    if (!readOnly) {
      results.push({
        id: call.id,
        name: call.name,
        result: {
          ok: false,
          error: opts.allowActions
            ? "MCP_MUTATION_REQUIRES_HOCKER_ONE_OWNER_GATE"
            : "MCP_MUTATION_NOT_AUTHORIZED",
          data: opts.allowActions ? buildOwnerGateDraft(call) : undefined,
        },
        executed: false,
        needsApproval: opts.allowActions,
      });
      continue;
    }

    const result = await registry.executeTool(call.name, call.args);
    results.push({
      id: call.id,
      name: call.name,
      result,
      executed: result.ok,
      needsApproval: false,
    });
  }

  return results;
}

export function formatToolResultsForUser(results: ToolExecutionResult[]): string {
  if (results.length === 0) return "";

  const lines: string[] = [];
  for (const result of results) {
    const status = result.result.ok ? "✓" : result.needsApproval ? "⏳" : "✗";
    const toolLabel = result.name.replace(/\./g, " ");

    if (result.needsApproval && !result.executed) {
      lines.push(`${status} ${toolLabel}: quedó preparada para aprobación en Hocker ONE.`);
    } else if (result.result.ok) {
      lines.push(`${status} ${toolLabel}: ${summarizeResult(result.result.data)}`);
    } else {
      lines.push(`${status} ${toolLabel}: ${result.result.error ?? "error"}`);
    }
  }

  return lines.join("\n");
}

function summarizeResult(data: unknown): string {
  if (data === null || data === undefined) return "ok";
  if (Array.isArray(data)) return `${data.length} elementos`;
  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (typeof obj.count === "number") return `${obj.count} registros`;
    if (Array.isArray(obj.data)) return `${obj.data.length} elementos`;
    if (obj.url) return `disponible en ${obj.url}`;
    if (obj.text) {
      const text = String(obj.text);
      return `"${text.slice(0, 80)}${text.length > 80 ? "…" : ""}"`;
    }
    if (obj.content) return "contenido recibido";
    if (obj.branch) return `rama ${obj.branch} lista`;
    if (obj.number) return `#${obj.number} creado`;
  }
  return "ok";
}

export function buildToolMessages(results: ToolExecutionResult[]): Array<{
  role: "tool";
  content: string;
  name?: string;
}> {
  return results.map((result) => ({
    role: "tool" as const,
    content: JSON.stringify({
      id: result.id,
      name: result.name,
      ok: result.result.ok,
      data: result.result.data,
      error: result.result.error,
      needs_approval: result.needsApproval,
    }),
    name: result.name,
  }));
}

export async function integrateMcpToolCalls(
  reply: string,
  opts: { allowActions: boolean },
): Promise<McpChatIntegration> {
  const registry = getMcpRegistry();
  const tools = registry.getConnectedTools();
  const toolPromptBlock = registry.buildPromptBlock();
  const parsedCalls = parseToolCallsFromReply(reply);
  const results = parsedCalls.length > 0
    ? await executeToolCalls(parsedCalls, opts)
    : [];

  return {
    toolsAvailable: tools.length,
    toolCallsParsed: parsedCalls.length,
    toolCallsExecuted: results.filter((result) => result.executed).length,
    toolCallsDeferred: results.filter((result) => result.needsApproval && !result.executed).length,
    results,
    toolPromptBlock,
  };
}

export function mcpToolsPromptBlock(): string {
  return getMcpRegistry().buildPromptBlock();
}

export async function initializeMcp(): Promise<void> {
  await getMcpRegistry().initializeAll();
}

export function mcpStatus(): {
  enabled: boolean;
  providers: number;
  connected: number;
  configured: number;
  totalTools: number;
} {
  const status = getMcpRegistry().getStatus();
  return {
    enabled: String(process.env.MCP_ENABLED ?? "true").toLowerCase() !== "false",
    providers: status.providers.length,
    connected: status.connectedProviders,
    configured: status.configuredProviders,
    totalTools: status.totalTools,
  };
}
