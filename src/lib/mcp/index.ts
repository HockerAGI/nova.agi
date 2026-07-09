/**
 * NOVA AGI — MCP Module
 *
 * Barrel exports for the Model Context Protocol connector system.
 * This module gives NOVA the same tool-calling capabilities as
 * Claude, Replit Agent, OpenAI Codex, and Google Antigravity.
 */

export { McpConnector } from "./mcp-connector.js";
export type {
  McpTransport,
  McpToolSchema,
  McpToolResult,
  McpProviderState,
  McpConnectorConfig,
} from "./mcp-connector.js";

export { SupabaseMcpConnector } from "./mcp-supabase.js";
export { GitHubMcpConnector } from "./mcp-github.js";
export { VercelMcpConnector } from "./mcp-vercel.js";
export { OpenAiMcpConnector } from "./mcp-openai.js";

export { getMcpRegistry } from "./mcp-registry.js";
export type { McpRegistryState, McpToolHandle } from "./mcp-registry.js";
