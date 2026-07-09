/**
 * NOVA AGI — MCP Tool Calling Integration
 *
 * Bridges NOVA's chat flow to the MCP registry, enabling function-calling
 * like Claude, Replit Agent, OpenAI Codex, and Google Antigravity.
 *
 * Flow:
 *  1. NOVA receives a user message
 *  2. If MCP tools are connected, they're described in the system prompt
 *  3. The LLM may request tool calls via JSON in its reply
 *  4. This module parses tool-call requests, executes them via the registry
 *  5. Results are formatted and returned alongside the reply
 *  6. For multi-turn tool use, results are fed back as tool messages
 *
 * Security:
 *  - All mutating tools (insert, update, delete, deploy, commit, PR)
 *    require the Hocker ONE approval chain (needs_approval=true)
 *  - Read-only tools (select, list, get, count) execute directly
 *  - No tool ever executes without the MCP master switch being on
 */

import { getMcpRegistry } from "./mcp/mcp-registry.js";
import type { McpToolResult } from "./mcp/mcp-connector.js";

// Tools that are safe to execute directly (read-only)
const READ_ONLY_TOOL_PATTERNS = [
  /^supabase\.(table\.select|table\.count|schema\.list|rpc\.call)/,
  /^github\.(repo\.get|repo\.list_tree|repo\.read_file|repo\.list_prs|repo\.list_issues)/,
  /^vercel\.(project\.list|project\.get|deployment\.list|deployment\.get|env\.list)/,
  /^openai\.(embed\.create|moderate|model\.list|chat\.structured)/,
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

/** Determine if a qualified tool name is read-only or requires approval */
export function isReadOnlyTool(qualifiedName: string): boolean {
  return READ_ONLY_TOOL_PATTERNS.some((pattern) => pattern.test(qualifiedName));
}

/**
 * Parse a NOVA reply for tool-call requests.
 * NOVA's LLM may include a "tool_calls" array in its JSON envelope,
 * or inline tool-call blocks delimited by <tool_call>...</tool_call>.
 */
export function parseToolCallsFromReply(reply: string): ParsedToolCall[] {
  const clean = String(reply ?? "").trim();
  if (!clean) return [];

  const calls: ParsedToolCall[] = [];

  // Strategy 1: JSON envelope with tool_calls array
  try {
    const parsed = JSON.parse(clean) as Record<string, unknown>;
    if (Array.isArray(parsed.tool_calls)) {
      for (const tc of parsed.tool_calls) {
        const call = normalizeToolCall(tc);
        if (call) calls.push(call);
      }
    }
    if (calls.length > 0) return calls;
  } catch { /* not JSON, try other strategies */ }

  // Strategy 2: <tool_call> delimited blocks
  const blockPattern = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(clean)) !== null) {
    try {
      const blockContent = match[1];
      if (!blockContent) continue;
      const parsed = JSON.parse(blockContent.trim()) as Record<string, unknown>;
      const call = normalizeToolCall(parsed);
      if (call) calls.push(call);
    } catch { /* skip malformed */ }
  }
  if (calls.length > 0) return calls;

  // Strategy 3: JSON blocks that look like { "tool": "provider.name", "args": {...} }
  const jsonBlockPattern = /\{[^{}]*"tool"\s*:\s*"[^"]+"[^{}]*\}/g;
  while ((match = jsonBlockPattern.exec(clean)) !== null) {
    try {
      const parsed = JSON.parse(match[0]) as Record<string, unknown>;
      const call = normalizeToolCall(parsed);
      if (call) calls.push(call);
    } catch { /* skip */ }
  }

  return calls;
}

function normalizeToolCall(raw: unknown): ParsedToolCall | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const name = String(obj.name ?? obj.tool ?? obj.function ?? "").trim();
  if (!name || !name.includes(".")) return null;

  const args = (obj.args ?? obj.arguments ?? obj.input ?? {}) as Record<string, unknown>;
  const id = String(obj.id ?? `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

  return { id, name, args: args && typeof args === "object" ? args as Record<string, unknown> : {} };
}

/**
 * Execute parsed tool calls through the MCP registry.
 * Read-only tools execute directly; mutating tools are deferred
 * to the Hocker ONE approval chain.
 */
export async function executeToolCalls(
  calls: ParsedToolCall[],
  opts: { allowActions: boolean },
): Promise<ToolExecutionResult[]> {
  const registry = getMcpRegistry();
  const results: ToolExecutionResult[] = [];

  for (const call of calls) {
    const readOnly = isReadOnlyTool(call.name);

    // Mutating tools always need approval, regardless of allowActions
    if (!readOnly && !opts.allowActions) {
      results.push({
        id: call.id,
        name: call.name,
        result: { ok: false, error: "Mutating tool requires Hocker ONE approval chain" },
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
      needsApproval: !readOnly,
    });
  }

  return results;
}

/**
 * Format tool execution results as a human-readable summary for NOVA's reply.
 * This keeps the user informed without leaking provider internals.
 */
export function formatToolResultsForUser(results: ToolExecutionResult[]): string {
  if (results.length === 0) return "";

  const lines: string[] = [];
  for (const r of results) {
    const status = r.result.ok ? "✓" : r.needsApproval ? "⏳" : "✗";
    const toolLabel = r.name.replace(/\./g, " ");

    if (r.needsApproval && !r.executed) {
      lines.push(`${status} ${toolLabel}: requiere aprobación en Hocker ONE.`);
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

/**
 * Build tool messages for multi-turn LLM conversations.
 * These are injected as "tool" role messages so the LLM can
 * continue reasoning with the tool results.
 */
export function buildToolMessages(results: ToolExecutionResult[]): Array<{ role: "tool"; content: string; name?: string }> {
  return results.map((r) => ({
    role: "tool" as const,
    content: JSON.stringify({ id: r.id, name: r.name, ok: r.result.ok, data: r.result.data, error: r.result.error }),
    name: r.name,
  }));
}

/**
 * Full MCP chat integration: build the prompt block, parse tool calls
 * from a reply, execute them, and return a complete integration result.
 */
export async function integrateMcpToolCalls(
  reply: string,
  opts: { allowActions: boolean },
): Promise<McpChatIntegration> {
  const registry = getMcpRegistry();
  const status = registry.getStatus();
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

/** Get available tools as a prompt fragment for the system prompt */
export function mcpToolsPromptBlock(): string {
  const registry = getMcpRegistry();
  return registry.buildPromptBlock();
}

/** Initialize the MCP registry (idempotent) */
export async function initializeMcp(): Promise<void> {
  const registry = getMcpRegistry();
  await registry.initializeAll();
}

/** Get MCP status for health/mesh endpoints */
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
    enabled: Boolean(process.env.MCP_ENABLED ?? "true"),
    providers: status.providers.length,
    connected: status.connectedProviders,
    configured: status.configuredProviders,
    totalTools: status.totalTools,
  };
}
