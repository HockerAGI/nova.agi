/**
 * NOVA AGI — MCP Registry
 *
 * Central registry managing all MCP connectors. This is the bridge
 * that gives NOVA tool-calling capabilities like Claude, Replit Agent,
 * OpenAI Codex, and Google Antigravity.
 *
 * Connectors managed:
 *  - Supabase : database, auth, storage, edge functions
 *  - GitHub   : repos, branches, commits, PRs, issues
 *  - Vercel   : projects, deployments, env vars
 *  - OpenAI   : embeddings, moderation, images, audio, structured chat
 *
 * Principles:
 *  - IA↔IA ganar-ganar: every connector is a peer in the AGI mesh
 *  - Provider-invisible: NOVA never leaks connector internals to users
 *  - Fail-safe: missing connectors degrade gracefully, never crash
 *  - Owner Gate: all mutating tools require Hocker ONE approval chain
 */

import { McpConnector, type McpProviderState, type McpToolResult, type McpToolSchema } from "./mcp-connector.js";
import { SupabaseMcpConnector } from "./mcp-supabase.js";
import { GitHubMcpConnector } from "./mcp-github.js";
import { VercelMcpConnector } from "./mcp-vercel.js";
import { OpenAiMcpConnector } from "./mcp-openai.js";

export type McpRegistryState = {
  initialized: boolean;
  providers: McpProviderState[];
  totalTools: number;
  connectedProviders: number;
  configuredProviders: number;
};

export type McpToolHandle = {
  provider: string;
  tool: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

class McpRegistry {
  private connectors: Map<string, McpConnector> = new Map();
  private initialized = false;

  /** Get or create the connector instances */
  private ensureConnectors(): void {
    if (this.connectors.size === 0) {
      this.connectors.set("supabase", new SupabaseMcpConnector());
      this.connectors.set("github", new GitHubMcpConnector());
      this.connectors.set("vercel", new VercelMcpConnector());
      this.connectors.set("openai", new OpenAiMcpConnector());
    }
  }

  /**
   * Initialize all connectors in parallel.
   * Each connector independently checks its configuration and connectivity.
   * Failures are non-fatal — the registry reports status per connector.
   */
  async initializeAll(): Promise<McpRegistryState> {
    this.ensureConnectors();
    const entries = [...this.connectors.values()];

    await Promise.allSettled(entries.map((c) => c.initialize()));

    this.initialized = true;
    return this.getStatus();
  }

  /** Get the current registry status */
  getStatus(): McpRegistryState {
    this.ensureConnectors();
    const providers = [...this.connectors.values()].map((c) => c.getState());
    return {
      initialized: this.initialized,
      providers,
      totalTools: providers.reduce((sum, p) => sum + p.toolCount, 0),
      connectedProviders: providers.filter((p) => p.status === "connected").length,
      configuredProviders: providers.filter((p) => p.configured).length,
    };
  }

  /** Get all tools from all connectors as a flat list */
  getAllTools(): McpToolHandle[] {
    this.ensureConnectors();
    const handles: McpToolHandle[] = [];
    for (const [id, connector] of this.connectors) {
      for (const tool of connector.getTools()) {
        handles.push({
          provider: String(id),
          tool: String(tool.name),
          description: String((tool as Partial<McpToolSchema>).description ?? ""),
          inputSchema: ((tool as Partial<McpToolSchema>).inputSchema ?? {}) as Record<string, unknown>,
        });
      }
    }
    return handles;
  }

  /** Get tools only from connected providers */
  getConnectedTools(): McpToolHandle[] {
    return this.getAllTools().filter((h) => {
      const connector = this.connectors.get(h.provider);
      return connector?.getState().status === "connected";
    });
  }

  /**
   * Build an OpenAI-compatible tool definitions array for function-calling.
   * This lets NOVA pass available MCP tools to any LLM provider that
   * supports tool/function calling.
   */
  buildToolDefinitions(): Array<{
    type: "function";
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }> {
    return this.getConnectedTools().map((h) => ({
      type: "function" as const,
      function: {
        name: `${h.provider}.${h.tool}`,
        description: h.description,
        parameters: h.inputSchema,
      },
    }));
  }

  /**
   * Execute a tool call. The tool name must be in the form "provider.tool"
   * e.g. "supabase.table.select", "github.repo.read_file"
   */
  async executeTool(qualifiedName: string, args: Record<string, unknown>): Promise<McpToolResult> {
    this.ensureConnectors();
    const dotIndex = qualifiedName.indexOf(".");
    if (dotIndex < 1) return { ok: false, error: `Invalid tool name: ${qualifiedName}` };

    const providerId = qualifiedName.slice(0, dotIndex);
    const toolName = qualifiedName.slice(dotIndex + 1);

    const connector = this.connectors.get(providerId);
    if (!connector) return { ok: false, error: `Unknown provider: ${providerId}` };

    if (connector.getState().status !== "connected") {
      // Try to initialize on-demand
      if (connector.isConfigured()) {
        await connector.initialize();
      }
      if (connector.getState().status !== "connected") {
        return { ok: false, error: `Provider ${providerId} not connected` };
      }
    }

    return connector.callTool(toolName, args);
  }

  /**
   * Execute a batch of tool calls (e.g. from LLM tool-call responses).
   * Returns results keyed by tool call id.
   */
  async executeBatch(calls: Array<{ id: string; name: string; args: Record<string, unknown> }>): Promise<Array<{ id: string; result: McpToolResult }>> {
    const results = await Promise.allSettled(
      calls.map(async (c) => ({ id: c.id, result: await this.executeTool(c.name, c.args) })),
    );
    return results.map((r, i) => {
      const call = calls[i];
      if (r.status === "fulfilled") return r.value;
      return { id: call?.id ?? "unknown", result: { ok: false, error: r.reason instanceof Error ? r.reason.message : "Batch error" } };
    });
  }

  /** Ping all connectors to verify connectivity */
  async pingAll(): Promise<Record<string, boolean>> {
    this.ensureConnectors();
    const entries = [...this.connectors.entries()];
    const results = await Promise.allSettled(
      entries.map(async ([id, c]) => [id, await c.ping()] as const),
    );
    const out: Record<string, boolean> = {};
    results.forEach((r, i) => {
      const entry = entries[i];
      if (!entry) return;
      const id = entry[0];
      out[id] = r.status === "fulfilled" && r.value[1];
    });
    return out;
  }

  /** Get a specific connector by id */
  getConnector(id: string): McpConnector | undefined {
    this.ensureConnectors();
    return this.connectors.get(id);
  }

  /**
   * Build a compact prompt block describing available MCP tools.
   * Injected into NOVA's system prompt so the LLM knows what it can call.
   */
  buildPromptBlock(): string {
    const tools = this.getConnectedTools();
    if (tools.length === 0) {
      return "MCP: No hay integraciones conectadas en este momento.";
    }

    // Group tools by provider for clearer presentation
    const byProvider = new Map<string, string[]>();
    for (const h of tools) {
      const arr = byProvider.get(h.provider) ?? [];
      arr.push(`${h.tool}: ${h.description}`);
      byProvider.set(h.provider, arr);
    }

    const sections: string[] = [];
    for (const [provider, toolLines] of byProvider) {
      sections.push(`  [${provider}]`);
      for (const line of toolLines) {
        sections.push(`    - ${provider}.${line}`);
      }
    }

    return [
      "═══ MCP — HERRAMIENTAS REALES DISPONIBLES ═══",
      "Tienes acceso a herramientas REALES que devuelven datos en tiempo real del sistema.",
      "Cuando el usuario pida información del sistema (tablas, repos, despliegues, datos),",
      "DEBES usar estas herramientas en lugar de responder con texto genérico.",
      "",
      "Herramientas disponibles:",
      ...sections,
      "",
      "═══ CÓMO INVOCAR HERRAMIENTAS ═══",
      "Para usar una herramienta, incluye en tu respuesta un bloque JSON con tool_calls.",
      "El formato EXACTO es:",
      "",
      '  {"reply":"Tu mensaje al usuario.","tool_calls":[{"name":"provider.tool","args":{...}}]}',
      "",
      "Ejemplos:",
      '  • Listar tablas: {"reply":"Voy a revisar las tablas.","tool_calls":[{"name":"supabase.schema.list","args":{}}]}',
      '  • Leer archivo: {"reply":"Revisando el código.","tool_calls":[{"name":"github.repo.read_file","args":{"path":"src/app.ts","ref":"main"}}]}',
      '  • Contar filas: {"reply":"Consultando.","tool_calls":[{"name":"supabase.table.count","args":{"table":"agis"}}]}',
      '  • Listar despliegues: {"reply":"Revisando.","tool_calls":[{"name":"vercel.deployment.list","args":{}}]}',
      "",
      "REGLAS:",
      "1. Las herramientas de SOLO LECTURA (select, count, list, get, read_file) se ejecutan automáticamente.",
      "2. Las herramientas que MODIFICAN (insert, update, delete, commit, PR, deploy) requieren aprobación del Owner.",
      "3. NUNCA inventes datos — si puedes consultarlos con una herramienta, HAZLO.",
      "4. Tu reply debe ser natural y en español; los tool_calls se procesan automáticamente.",
      "5. Puedes hacer múltiples tool_calls en una sola respuesta.",
      "═══ FIN MCP ═══",
    ].join("\n");
  }

  /** Disconnect all connectors */
  disconnectAll(): void {
    for (const connector of this.connectors.values()) {
      connector.disconnect();
    }
    this.initialized = false;
  }
}

// Singleton — one registry per process
let registryInstance: McpRegistry | null = null;

export function getMcpRegistry(): McpRegistry {
  if (!registryInstance) {
    registryInstance = new McpRegistry();
  }
  return registryInstance;
}

export type { McpRegistry as McpRegistryType };
