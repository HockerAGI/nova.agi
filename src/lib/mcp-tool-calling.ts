/**
 * NOVA AGI — MCP Tool Calling Integration
 *
 * Bridges NOVA's chat flow to the MCP registry, enabling function-calling
 * while preserving the Hocker ONE Owner Gate.
 *
 * Security contract:
 *  - Read-only tools may execute directly.
 *  - Every mutating or ambiguous tool is prepared as an action draft.
 *  - NOVA never executes writes, deployments, commits, PRs or RPC calls.
 *  - Hocker ONE is the only component allowed to approve and execute drafts.
 */

import { getMcpRegistry } from "./mcp/mcp-registry.js";
import type { McpToolResult } from "./mcp/mcp-connector.js";

// Keep this allowlist intentionally narrow. A tool is read-only only when its
// contract guarantees that it cannot change remote state. Generic RPC calls
// are excluded because a database function may mutate balances or permissions.
const READ_ONLY_TOOL_PATTERNS = [
  /^supabase\.(table\.select|table\.count|schema\.list)$/,
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

  try {
    const parsed = JSON.parse(clean) as Record<string, unknown>;
    if (Array.isArray(parsed.tool_calls)) {
      for (const tc of parsed.tool_calls) {
        const call = normalizeToolCall(tc);
        if (call) calls.push(call);
      }
    }
    if (calls.length > 0) return calls;
  } catch {
    // Not a JSON envelope; continue with delimited blocks.
  }

  const blockPattern = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(clean)) !== null) {
    try {
      const blockContent = match[1];
      if (!blockContent) continue;
      const parsed = JSON.parse(blockContent.trim()) as Record<string, unknown>;
      const call = normalizeToolCall(parsed);
      if (call) calls.push(call);
    } catch {
      // Skip malformed tool blocks.
    }
  }
  if (calls.length > 0) return calls;

  const jsonBlockPattern = /\{[^{}]*"tool"\s*:\s*"[^"]+"[^{}]*\}/g;
  while ((match = jsonBlockPattern.exec(clean)) !== null) {
    try {
      const parsed = JSON.parse(match[0]) as Record<string, unknown>;
      const call = normalizeToolCall(parsed);
      if (call) calls.push(call);
    } catch {
      // Skip malformed inline blocks.
    }
  }

  return calls;
}

function normalizeToolCall(raw: unknown): ParsedToolCall | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const name = String(obj.name ?? obj.tool ?? obj.function ?? "").trim();
  if (!name || !name.includes(".")) return null;

  const rawArgs = obj.args ?? obj.arguments ?? obj.input ?? {};
  const args = rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)
    ? rawArgs as Record<string, unknown>
    : {};
  const id = String(obj.id ?? `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

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

/**
 * Execute only proven read-only calls. All other calls are returned as drafts
 * so Hocker ONE can materialize, approve, lock, audit and execute them.
 */
export async function executeToolCalls(
  calls: ParsedToolCall[],
  opts: { allowActions: boolean },
): Promise<ToolExecutionResult[]> {
  void opts;
  const registry = getMcpRegistry();
  const results: ToolExecutionResult[] = [];

  for (const call of calls) {
    const readOnly = isReadOnlyTool(call.name);

    if (!readOnly) {
      results.push({
        id: call.id,
        name: call.name,
        result: {
          ok: false,
          error: "MCP_MUTATION_REQUIRES_HOCKER_ONE_OWNER_GATE",
          data: buildOwnerGateDraft(call),
        },
        executed: false,
        needsApproval: true,
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
  for (const r of results) {
    const status = r.result.ok ? "✓" : r.needsApproval ? "⏳" : "✗";
    const toolLabel = r.name.replace(/\./g, " ");

    if (r.needsApproval && !r.executed) {
      lines.push(`${status} ${toolLabel}: quedó preparada para aprobación en Hocker ONE.`);
    } else if (r.result.ok) {
      const summary = summarizeResult(r.result.data);
      lines.push(`${status} ${toolLabel}: ${summary}`);
    } else {
      lines.push(`${status} ${toolLabel}: ${r.result.error ?? "error"}`);
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
    if (obj.text) return `"${String(obj.text).slice(0, 80)}${String(obj.text).length > 80 ? "…" : ""}"`;
    if (obj.content) return "contenido recibido";
    if (obj.branch) return `rama ${obj.branch} lista`;
    if (obj.number) return `#${obj.number} creado`;
  }
  return "ok";
}

export function buildToolMessages(results: ToolExecutionResult[]): Array<{ role: "tool"; content: string; name?: string }> {
  return results.map((r) => ({
    role: "tool" as const,
    content: JSON.stringify({
      id: r.id,
      name: r.name,
      ok: r.result.ok,
      data: r.result.data,
      error: r.result.error,
      needs_approval: r.needsApproval,
    }),
    name: r.name,
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
  const results = parsedCalls.length > 0 ? await executeToolCalls(parsedCalls, opts) : [];

  return {
    toolsAvailable: tools.length,
    toolCallsParsed: parsedCalls.length,
    toolCallsExecuted: results.filter((r) => r.executed).length,
    toolCallsDeferred: results.filter((r) => r.needsApproval && !r.executed).length,
    results,
    toolPromptBlock,
  };
}

export function mcpToolsPromptBlock(): string {
  const registry = getMcpRegistry();
  return registry.buildPromptBlock();
}

export async function initializeMcp(): Promise<void> {
  const registry = getMcpRegistry();
  await registry.initializeAll();
}

export function mcpStatus(): {
  enabled: boolean;
  providers: number;
  connected: number;
  configured: number;
  totalTools: number;
} {
  const registry = getMcpRegistry();
  const status = registry.getStatus();
  return {
    enabled: String(process.env.MCP_ENABLED ?? "true").toLowerCase() !== "false",
    providers: status.providers.length,
    connected: status.connectedProviders,
    configured: status.configuredProviders,
    totalTools: status.totalTools,
  };
}
