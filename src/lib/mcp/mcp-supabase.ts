/**
 * NOVA AGI — Supabase MCP Connector
 *
 * Read operations use a service role only behind the authenticated NOVA
 * runtime and are restricted to an explicit operational allowlist.
 * Mutations are never executed in nova.agi; they must be deferred to the
 * Hocker ONE Owner Gate.
 */

import {
  McpConnector,
  type McpConnectorConfig,
  type McpToolResult,
  type McpToolSchema,
} from "./mcp-connector.js";

const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;
const SAFE_COLUMN_EXPRESSION = /^[a-z0-9_.*(),:!\- >]+$/i;
const MAX_READ_LIMIT = 100;
const MAX_FILTER_BYTES = 2048;
const MUTATION_TOOLS = new Set([
  "table.insert",
  "table.upsert",
  "table.update",
  "rpc.call",
]);

const DEFAULT_READ_TABLES = [
  "agi_action_queue",
  "agi_agent_tools",
  "agi_agents",
  "agi_runs",
  "agi_tasks",
  "agi_tools",
  "agis_public_catalog",
  "agent_logs",
  "audit_chain",
  "audit_logs",
  "command_logs",
  "commands",
  "events",
  "hocker_dashboard_snapshot",
  "llm_usage",
  "node_heartbeats",
  "nodes",
  "nova_messages",
  "nova_threads",
  "observability_alerts",
  "observability_incidents",
  "projects",
  "system_controls",
] as const;

const SUPABASE_TOOLS: McpToolSchema[] = [
  {
    name: "table.select",
    description: "Select rows from an allowlisted operational Supabase table.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string", description: "Allowlisted table name" },
        columns: { type: "string", description: "PostgREST select expression; default *" },
        filter: { type: "string", description: "Query filters, e.g. status=eq.pending" },
        limit: { type: "number", description: `Row limit; maximum ${MAX_READ_LIMIT}` },
        order: { type: "string", description: "Order clause, e.g. created_at.desc" },
      },
      required: ["table"],
    },
  },
  {
    name: "table.count",
    description: "Count rows in an allowlisted operational Supabase table.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string" },
        filter: { type: "string" },
      },
      required: ["table"],
    },
  },
  {
    name: "table.insert",
    description: "Prepare a table insert for the Hocker ONE Owner Gate.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string" },
        rows: { type: "array" },
      },
      required: ["table", "rows"],
    },
  },
  {
    name: "table.upsert",
    description: "Prepare a table upsert for the Hocker ONE Owner Gate.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string" },
        rows: { type: "array" },
        on_conflict: { type: "string" },
      },
      required: ["table", "rows"],
    },
  },
  {
    name: "table.update",
    description: "Prepare a filtered table update for the Hocker ONE Owner Gate.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string" },
        filter: { type: "string" },
        values: { type: "object" },
      },
      required: ["table", "filter", "values"],
    },
  },
  {
    name: "rpc.call",
    description: "Prepare a Postgres RPC call for the Hocker ONE Owner Gate.",
    inputSchema: {
      type: "object",
      properties: {
        function: { type: "string" },
        args: { type: "object" },
      },
      required: ["function"],
    },
  },
  {
    name: "schema.list",
    description: "List operational tables visible to NOVA read tools.",
    inputSchema: { type: "object", properties: {} },
  },
];

function envList(name: string, fallback: readonly string[]): string[] {
  const raw = String(process.env[name] ?? "").trim();
  return (raw ? raw.split(",") : [...fallback])
    .map((item) => item.trim())
    .filter(Boolean);
}

function assertIdentifier(value: unknown, label: string): string {
  const clean = String(value ?? "").trim();
  if (!SAFE_IDENTIFIER.test(clean)) {
    throw new Error(`${label} inválido.`);
  }
  return clean;
}

function allowedReadTables(): Set<string> {
  return new Set(
    envList("NOVA_SUPABASE_READ_TABLES", DEFAULT_READ_TABLES)
      .map((item) => assertIdentifier(item, "Tabla permitida").toLowerCase()),
  );
}

function assertReadTable(value: unknown): string {
  const table = assertIdentifier(value, "Tabla");
  if (!allowedReadTables().has(table.toLowerCase())) {
    throw new Error(`Tabla fuera de la allowlist de lectura NOVA: ${table}`);
  }
  return table;
}

function safeColumns(value: unknown): string {
  const columns = String(value ?? "*").trim() || "*";
  if (columns.length > 1000 || !SAFE_COLUMN_EXPRESSION.test(columns)) {
    throw new Error("Expresión de columnas inválida.");
  }
  return columns;
}

function applyFilter(url: URL, value: unknown): void {
  const filter = String(value ?? "").trim();
  if (!filter) return;
  if (Buffer.byteLength(filter, "utf8") > MAX_FILTER_BYTES || /[\r\n#]/.test(filter)) {
    throw new Error("Filtro Supabase inválido o demasiado grande.");
  }

  const params = new URLSearchParams(filter);
  for (const [key, item] of params.entries()) {
    if (!SAFE_IDENTIFIER.test(key) || ["select", "limit", "offset", "order"].includes(key)) {
      throw new Error(`Parámetro de filtro no permitido: ${key}`);
    }
    if (item.length > 1000) throw new Error(`Filtro demasiado grande: ${key}`);
    url.searchParams.append(key, item);
  }
}

function safeOrder(value: unknown): string | undefined {
  const order = String(value ?? "").trim();
  if (!order) return undefined;
  if (!/^[a-z_][a-z0-9_]*(\.(asc|desc))?(\.nulls(first|last))?$/i.test(order)) {
    throw new Error("Orden Supabase inválido.");
  }
  return order;
}

function mutationBlocked(): McpToolResult {
  return {
    ok: false,
    error: "MCP_MUTATION_REQUIRES_HOCKER_ONE_OWNER_GATE",
  };
}

export class SupabaseMcpConnector extends McpConnector {
  private url: string;
  private key: string;

  constructor() {
    const config: McpConnectorConfig = {
      id: "supabase",
      name: "Supabase MCP",
      transport: "http",
      timeoutMs: 30_000,
      enabled: true,
      requiredEnv: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    };
    super(config);
    this.url = String(process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
    this.key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
  }

  async initialize(): Promise<{ capabilities: string[]; tools: McpToolSchema[] }> {
    if (!this.isConfigured()) {
      this.markError("Supabase URL or service role key missing");
      return { capabilities: [], tools: [] };
    }

    const connected = await this.ping();
    if (!connected) {
      this.markError("Supabase health check failed");
      return { capabilities: [], tools: [] };
    }

    this.setTools(SUPABASE_TOOLS);
    this.markConnected(["database-read", "owner-gated-mutations"]);
    return { capabilities: this.state.capabilities, tools: SUPABASE_TOOLS };
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.url}/auth/v1/health`, {
        headers: { apikey: this.key },
        signal: AbortSignal.timeout(8000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  private restUrl(table: string): URL {
    return new URL(`/rest/v1/${encodeURIComponent(table)}`, `${this.url}/`);
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<McpToolResult> {
    if (!this.isConfigured()) return { ok: false, error: "Supabase not configured" };
    if (MUTATION_TOOLS.has(toolName)) return mutationBlocked();

    try {
      switch (toolName) {
        case "table.select":
          return await this.tableSelect(args);
        case "table.count":
          return await this.tableCount(args);
        case "schema.list":
          return await this.schemaList();
        default:
          return { ok: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async tableSelect(args: Record<string, unknown>): Promise<McpToolResult> {
    const table = assertReadTable(args.table);
    const columns = safeColumns(args.columns);
    const limit = Math.min(
      Math.max(Math.trunc(Number(args.limit ?? 50)), 1),
      MAX_READ_LIMIT,
    );
    const url = this.restUrl(table);
    url.searchParams.set("select", columns);
    url.searchParams.set("limit", String(limit));
    applyFilter(url, args.filter);

    const order = safeOrder(args.order);
    if (order) url.searchParams.set("order", order);

    const res = await fetch(url, {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    const data = await res.json().catch(() => []);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, data };
    return {
      ok: true,
      data,
      meta: { table, count: Array.isArray(data) ? data.length : 0, limit },
    };
  }

  private async tableCount(args: Record<string, unknown>): Promise<McpToolResult> {
    const table = assertReadTable(args.table);
    const url = this.restUrl(table);
    url.searchParams.set("select", "*");
    url.searchParams.set("limit", "1");
    applyFilter(url, args.filter);

    const res = await fetch(url, {
      headers: this.headers({ Prefer: "count=exact", Range: "0-0" }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    const range = res.headers.get("content-range") ?? "";
    const total = range.includes("/") ? Number(range.split("/")[1]) : 0;
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, data: { count: total }, meta: { table } };
  }

  private async schemaList(): Promise<McpToolResult> {
    const tables = [...allowedReadTables()].sort();
    return { ok: true, data: { tables }, meta: { count: tables.length } };
  }
}
