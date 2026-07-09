/**
 * NOVA AGI — MCP Connector Base
 *
 * Base interface for Model Context Protocol connectors.
 * Allows NOVA to connect to external services (Supabase, GitHub, Vercel, OpenAI)
 * through a unified tool-calling interface — the same pattern used by
 * Claude, Replit Agent, OpenAI Codex, and Google Antigravity.
 *
 * Principle: IA-IA ganar-ganar. Every connector is a first-class citizen
 * in the AGI mesh; NOVA delegates to it and receives structured results.
 */

export type McpTransport = "http" | "stdio" | "sse";

export type McpToolSchema = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type McpToolResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
  meta?: Record<string, unknown>;
};

export type McpProviderState = {
  id: string;
  name: string;
  status: "connected" | "disconnected" | "error";
  configured: boolean;
  capabilities: string[];
  toolCount: number;
  lastPingAt: string | null;
  lastError: string | null;
};

export type McpConnectorConfig = {
  id: string;
  name: string;
  transport: McpTransport;
  timeoutMs: number;
  enabled: boolean;
  /** Env vars required for this connector to be considered configured */
  requiredEnv: string[];
};

/**
 * Abstract base class for all MCP connectors.
 * Each connector wraps a specific external service and exposes
 * a normalized set of tools that NOVA can call during chat.
 */
export abstract class McpConnector {
  protected config: McpConnectorConfig;
  protected state: McpProviderState;
  protected tools: McpToolSchema[] = [];

  constructor(config: McpConnectorConfig) {
    this.config = config;
    this.state = {
      id: config.id,
      name: config.name,
      status: "disconnected",
      configured: false,
      capabilities: [],
      toolCount: 0,
      lastPingAt: null,
      lastError: null,
    };
  }

  /** Whether all required env vars are present */
  isConfigured(): boolean {
    return this.config.requiredEnv.every(
      (key) => Boolean(String(process.env[key] ?? "").trim()),
    );
  }

  /** Initialize the connector — fetch tools, set state */
  abstract initialize(): Promise<{ capabilities: string[]; tools: McpToolSchema[] }>;

  /** Ping the remote service to verify connectivity */
  abstract ping(): Promise<boolean>;

  /** Execute a tool call by name with structured arguments */
  abstract callTool(toolName: string, args: Record<string, unknown>): Promise<McpToolResult>;

  /** Disconnect and release resources */
  disconnect(): void {
    this.state.status = "disconnected";
  }

  getState(): McpProviderState {
    return { ...this.state, configured: this.isConfigured() };
  }

  getTools(): McpToolSchema[] {
    return [...this.tools];
  }

  get id(): string {
    return this.config.id;
  }

  get name(): string {
    return this.config.name;
  }

  protected setState(partial: Partial<McpProviderState>): void {
    this.state = { ...this.state, ...partial };
  }

  protected setTools(tools: McpToolSchema[]): void {
    this.tools = tools;
    this.state.toolCount = tools.length;
  }

  protected markError(message: string): void {
    this.state.status = "error";
    this.state.lastError = message;
  }

  protected markConnected(capabilities: string[]): void {
    this.state.status = "connected";
    this.state.lastError = null;
    this.state.lastPingAt = new Date().toISOString();
    this.state.capabilities = capabilities;
  }
}
