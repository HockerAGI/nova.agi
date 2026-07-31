import type { JsonObject, JsonValue } from "../types.js";
import type { ToolExecutionResult } from "./mcp-tool-calling.js";

const PROVIDERS = new Set(["supabase", "github", "vercel", "openai"]);
const SENSITIVE_KEY = /(authorization|cookie|password|passwd|secret|token|api[_-]?key|private[_-]?key)/i;
const MAX_ARGS_BYTES = 16 * 1024;

export type DeferredMcpOwnerGateDraft = JsonObject & {
  draft_id: string;
  action_type: "mcp.execute";
  tool_key: "mcp";
  provider: string;
  tool: string;
  qualified_name: string;
  args: JsonObject;
  requires_approval: true;
  execution_target: "hocker.one.owner-gate";
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function hasSensitiveValue(value: unknown, depth = 0): boolean {
  if (depth > 8) return true;
  if (Array.isArray(value)) return value.some((item) => hasSensitiveValue(item, depth + 1));
  if (!value || typeof value !== "object") return false;

  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) => SENSITIVE_KEY.test(key) || hasSensitiveValue(child, depth + 1),
  );
}

function toJsonValue(value: unknown, depth = 0): JsonValue | undefined {
  if (depth > 8) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    return value
      .map((item) => toJsonValue(item, depth + 1))
      .filter((item): item is JsonValue => item !== undefined);
  }
  if (!value || typeof value !== "object") return undefined;

  const out: JsonObject = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = toJsonValue(child, depth + 1);
    if (normalized !== undefined) out[key] = normalized;
  }
  return out;
}

function normalizeOne(result: ToolExecutionResult): DeferredMcpOwnerGateDraft | null {
  if (result.executed || !result.needsApproval) return null;

  const data = asRecord(result.result.data);
  const provider = String(data.provider ?? "").trim().toLowerCase();
  const tool = String(data.tool ?? "").trim();
  const argsRaw = asRecord(data.args);

  if (!PROVIDERS.has(provider)) return null;
  if (!tool || tool.length > 160 || !/^[a-z0-9_.:-]+$/i.test(tool)) return null;
  if (hasSensitiveValue(argsRaw)) return null;

  const args = (toJsonValue(argsRaw) ?? {}) as JsonObject;
  if (Buffer.byteLength(JSON.stringify(args), "utf8") > MAX_ARGS_BYTES) return null;

  return {
    draft_id: String(result.id || `mcp-${Date.now()}`),
    action_type: "mcp.execute",
    tool_key: "mcp",
    provider,
    tool,
    qualified_name: `${provider}.${tool}`,
    args,
    requires_approval: true,
    execution_target: "hocker.one.owner-gate",
  };
}

export function collectDeferredMcpOwnerGateDrafts(
  results: ToolExecutionResult[],
): DeferredMcpOwnerGateDraft[] {
  const drafts: DeferredMcpOwnerGateDraft[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    const draft = normalizeOne(result);
    if (!draft) continue;

    const key = `${draft.qualified_name}:${JSON.stringify(draft.args)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    drafts.push(draft);
  }

  return drafts.slice(0, 8);
}
