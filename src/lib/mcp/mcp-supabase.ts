/**
 * NOVA AGI — Supabase MCP Connector
 *
 * Connects NOVA to the Supabase project for direct database, auth,
 * storage, and edge function operations. Uses the REST API (PostgREST)
 * with the service role key for admin-level operations.
 *
 * Tools exposed:
 *  - sql.query      : Execute a read-only SQL query via RPC
 *  - table.select   : Select rows from a table with filters
 *  - table.insert   : Insert rows into a table
 *  - table.update   : Update rows in a table
 *  - table.upsert   : Upsert rows into a table
 *  - table.count    : Count rows in a table
 *  - rpc.call       : Call a Postgres function (RPC)
 *  - schema.list    : List available tables
 */

import { McpConnector, type McpConnectorConfig, type McpToolResult, type McpToolSchema } from "./mcp-connector.js";

const SUPABASE_TOOLS: McpToolSchema[] = [
  {
    name: "table.select",
    description: "Select rows from a Supabase table with optional column selection, filters, and limit.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string", description: "Table name" },
        columns: { type: "string", description: "Comma-separated columns (default *)" },
        filter: { type: "string", description: "PostgREST filter e.g. status=eq.pending" },
        limit: { type: "number", description: "Row limit (default 50, max 1000)" },
        order: { type: "string", description: "Order clause e.g. created_at.desc" },
      },
      required: ["table"],
    },
  },
  {
    name: "table.count",
    description: "Count rows in a Supabase table with optional filter.",
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
    description: "Insert rows into a Supabase table.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string" },
        rows: { type: "array", description: "Array of row objects to insert" },
      },
      required: ["table", "rows"],
    },
  },
  {
    name: "table.upsert",
    description: "Upsert rows into a Supabase table.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string" },
        rows: { type: "array" },
        on_conflict: { type: "string", description: "Conflict target column(s)" },
      },
      required: ["table", "rows"],
    },
  },
  {
    name: "table.update",
    description: "Update rows in a Supabase table matching a filter.",
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
    description: "Call a Postgres function via RPC.",
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
    description: "List available tables in the public schema.",
    inputSchema: { type: "object", properties: {} },
  },
];

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
    this.markConnected(["database", "auth", "storage", "edge-functions"]);
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

  async callTool(toolName: string, args: Record<string, unknown>): Promise<McpToolResult> {
    if (!this.isConfigured()) {
      return { ok: false, error: "Supabase not configured" };
    }

    try {
      switch (toolName) {
        case "table.select":
          return await this.tableSelect(args);
        case "table.count":
          return await this.tableCount(args);
        case "table.insert":
          return await this.tableInsert(args);
        case "table.upsert":
          return await this.tableUpsert(args);
        case "table.update":
          return await this.tableUpdate(args);
        case "rpc.call":
          return await this.rpcCall(args);
        case "schema.list":
          return await this.schemaList();
        default:
          return { ok: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, error: msg };
    }
  }

  private buildPath(table: string, columns: string, filter?: string, order?: string, limit?: number): string {
    let path = `${table}?select=${encodeURIComponent(columns || "*")}`;
    if (filter) path += `&${filter}`;
    if (order) path += `&order=${encodeURIComponent(order)}`;
    const cap = Math.min(Math.max(Math.trunc(Number(limit ?? 50)), 1), 1000);
    path += `&limit=${cap}`;
    return path;
  }

  private async tableSelect(args: Record<string, unknown>): Promise<McpToolResult> {
    const table = String(args.table ?? "");
    if (!table) return { ok: false, error: "table is required" };
    const path = this.buildPath(
      table,
      String(args.columns ?? "*"),
      args.filter ? String(args.filter) : undefined,
      args.order ? String(args.order) : undefined,
      Number(args.limit ?? 50),
    );
    const res = await fetch(`${this.url}/rest/v1/${path}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    const data = await res.json().catch(() => []);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, data };
    return { ok: true, data, meta: { table, count: Array.isArray(data) ? data.length : 0 } };
  }

  private async tableCount(args: Record<string, unknown>): Promise<McpToolResult> {
    const table = String(args.table ?? "");
    if (!table) return { ok: false, error: "table is required" };
    let path = `${table}?select=id&limit=1`;
    if (args.filter) path += `&${args.filter}`;
    const res = await fetch(`${this.url}/rest/v1/${path}`, {
      headers: this.headers({ "Prefer": "count=exact", Range: "0-0" }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    const range = res.headers.get("content-range") ?? "";
    const total = range.includes("/") ? Number(range.split("/")[1]) : 0;
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, data: { count: total }, meta: { table } };
  }

  private async tableInsert(args: Record<string, unknown>): Promise<McpToolResult> {
    const table = String(args.table ?? "");
    const rows = args.rows;
    if (!table || !Array.isArray(rows)) return { ok: false, error: "table and rows[] required" };
    const res = await fetch(`${this.url}/rest/v1/${table}`, {
      method: "POST",
      headers: this.headers({ Prefer: "return=representation" }),
      body: JSON.stringify(rows),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, data };
    return { ok: true, data, meta: { table, inserted: Array.isArray(data) ? data.length : 0 } };
  }

  private async tableUpsert(args: Record<string, unknown>): Promise<McpToolResult> {
    const table = String(args.table ?? "");
    const rows = args.rows;
    if (!table || !Array.isArray(rows)) return { ok: false, error: "table and rows[] required" };
    const prefer = args.on_conflict
      ? `return=representation,resolution=merge-duplicates`
      : "return=representation,resolution=merge-duplicates";
    const res = await fetch(`${this.url}/rest/v1/${table}`, {
      method: "POST",
      headers: this.headers({
        Prefer: prefer,
        ...(args.on_conflict ? { "x-upsert-on-conflict": String(args.on_conflict) } : {}),
      }),
      body: JSON.stringify(rows),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, data };
    return { ok: true, data, meta: { table, upserted: Array.isArray(data) ? data.length : 0 } };
  }

  private async tableUpdate(args: Record<string, unknown>): Promise<McpToolResult> {
    const table = String(args.table ?? "");
    const filter = String(args.filter ?? "");
    const values = args.values;
    if (!table || !filter || !values) return { ok: false, error: "table, filter, values required" };
    const res = await fetch(`${this.url}/rest/v1/${table}?${filter}`, {
      method: "PATCH",
      headers: this.headers({ Prefer: "return=representation" }),
      body: JSON.stringify(values),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, data };
    return { ok: true, data, meta: { table, updated: Array.isArray(data) ? data.length : 0 } };
  }

  private async rpcCall(args: Record<string, unknown>): Promise<McpToolResult> {
    const fn = String(args.function ?? "");
    if (!fn) return { ok: false, error: "function is required" };
    const res = await fetch(`${this.url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(args.args ?? {}),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, data };
    return { ok: true, data, meta: { function: fn } };
  }

  private async schemaList(): Promise<McpToolResult> {
    const res = await fetch(`${this.url}/rest/v1/`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    const data = await res.json().catch(() => ({}));
    const definitions = (data as { definitions?: Record<string, unknown> })?.definitions ?? {};
    const tables = Object.keys(definitions);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, data: { tables }, meta: { count: tables.length } };
  }
}
