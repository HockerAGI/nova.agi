/**
 * NOVA AGI — Vercel MCP Connector
 *
 * Connects NOVA to Vercel for deployment, project, and environment
 * management. Uses the Vercel REST API with a bearer token.
 *
 * Tools exposed:
 *  - project.list        : List Vercel projects
 *  - project.get         : Get project details by name or id
 *  - deployment.list     : List deployments for a project
 *  - deployment.get      : Get deployment details
 *  - deployment.redeploy : Redeploy a previous deployment
 *  - env.list            : List environment variables for a project
 *  - env.create          : Create an environment variable
 *  - env.delete          : Delete an environment variable
 *  - deployment.create   : Create a new deployment from Git or files
 */

import { McpConnector, type McpConnectorConfig, type McpToolResult, type McpToolSchema } from "./mcp-connector.js";

const VERCEL_TOOLS: McpToolSchema[] = [
  {
    name: "project.list",
    description: "List Vercel projects (limited to 100).",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max projects to return (default 50)" },
      },
    },
  },
  {
    name: "project.get",
    description: "Get details of a Vercel project by name or id.",
    inputSchema: {
      type: "object",
      properties: {
        idOrName: { type: "string", description: "Project id or name" },
      },
      required: ["idOrName"],
    },
  },
  {
    name: "deployment.list",
    description: "List deployments for a Vercel project.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project id" },
        limit: { type: "number", description: "Max deployments (default 20)" },
        state: { type: "string", description: "Filter by state: READY, ERROR, BUILDING, QUEUED" },
        target: { type: "string", description: "Filter by target: production, preview" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "deployment.get",
    description: "Get details of a specific deployment by id or URL.",
    inputSchema: {
      type: "object",
      properties: {
        idOrUrl: { type: "string", description: "Deployment id or URL" },
      },
      required: ["idOrUrl"],
    },
  },
  {
    name: "deployment.redeploy",
    description: "Redeploy an existing deployment. Creates a new deployment with the same source.",
    inputSchema: {
      type: "object",
      properties: {
        deploymentId: { type: "string", description: "Deployment id to redeploy" },
        target: { type: "string", description: "production or preview (default production)" },
      },
      required: ["deploymentId"],
    },
  },
  {
    name: "env.list",
    description: "List environment variables for a Vercel project.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        target: { type: "string", description: "Filter by target: production, preview, development" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "env.create",
    description: "Create an environment variable for a Vercel project.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        key: { type: "string" },
        value: { type: "string" },
        type: { type: "string", description: "encrypted or plain (default encrypted)" },
        target: { type: "array", items: { type: "string" }, description: '["production","preview","development"]' },
      },
      required: ["projectId", "key", "value"],
    },
  },
  {
    name: "env.delete",
    description: "Delete an environment variable from a Vercel project.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        envId: { type: "string", description: "Environment variable id" },
      },
      required: ["projectId", "envId"],
    },
  },
  {
    name: "deployment.create",
    description: "Create a new deployment from a Git ref for a project.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        ref: { type: "string", description: "Git ref (branch name)" },
        target: { type: "string", description: "production or preview" },
      },
      required: ["projectId", "ref"],
    },
  },
];

const VERCEL_API = "https://api.vercel.com";

export class VercelMcpConnector extends McpConnector {
  private token: string;
  private teamId: string;

  constructor() {
    const config: McpConnectorConfig = {
      id: "vercel",
      name: "Vercel MCP",
      transport: "http",
      timeoutMs: 30_000,
      enabled: true,
      requiredEnv: ["VERCEL_TOKEN"],
    };
    super(config);
    this.token = String(process.env.VERCEL_TOKEN ?? process.env.HOCKER_VERCEL_TOKEN ?? "");
    this.teamId = String(process.env.VERCEL_TEAM_ID ?? process.env.HOCKER_VERCEL_TEAM_ID ?? "").trim();
  }

  async initialize(): Promise<{ capabilities: string[]; tools: McpToolSchema[] }> {
    if (!this.isConfigured()) {
      this.markError("VERCEL_TOKEN missing");
      return { capabilities: [], tools: [] };
    }
    const connected = await this.ping();
    if (!connected) {
      this.markError("Vercel API ping failed");
      return { capabilities: [], tools: [] };
    }
    this.setTools(VERCEL_TOOLS);
    this.markConnected(["projects", "deployments", "env-vars", "redeploys"]);
    return { capabilities: this.state.capabilities, tools: VERCEL_TOOLS };
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${VERCEL_API}/v2/user${this.teamQuery()}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(8000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private teamQuery(): string {
    return this.teamId ? `?teamId=${this.teamId}` : "";
  }

  private appendTeam(url: string): string {
    if (!this.teamId) return url;
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}teamId=${this.teamId}`;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
  }

  private async vercel(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: unknown }> {
    const res = await fetch(`${VERCEL_API}${this.appendTeam(url)}`, {
      ...init,
      headers: this.headers(),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<McpToolResult> {
    if (!this.isConfigured()) return { ok: false, error: "Vercel not configured" };
    try {
      switch (toolName) {
        case "project.list": return await this.projectList(args);
        case "project.get": return await this.projectGet(args);
        case "deployment.list": return await this.deploymentList(args);
        case "deployment.get": return await this.deploymentGet(args);
        case "deployment.redeploy": return await this.deploymentRedeploy(args);
        case "env.list": return await this.envList(args);
        case "env.create": return await this.envCreate(args);
        case "env.delete": return await this.envDelete(args);
        case "deployment.create": return await this.deploymentCreate(args);
        default: return { ok: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  private async projectList(args: Record<string, unknown>): Promise<McpToolResult> {
    const limit = Math.min(Math.max(Math.trunc(Number(args.limit ?? 50)), 1), 100);
    const { data, ok, status } = await this.vercel(`/v9/projects?limit=${limit}`);
    if (!ok) return { ok: false, error: `HTTP ${status}`, data };
    const projects = ((data as { projects?: Record<string, unknown>[] })?.projects ?? []) as Record<string, unknown>[];
    return {
      ok: true,
      data: projects.map((p) => ({
        id: p.id,
        name: p.name,
        framework: p.framework,
        latestDeploymentUrl: (p.latestDeployments as Record<string, unknown>[])?.[0]?.url,
        updatedAt: p.updatedAt,
      })),
      meta: { count: projects.length },
    };
  }

  private async projectGet(args: Record<string, unknown>): Promise<McpToolResult> {
    const { data, ok, status } = await this.vercel(`/v9/projects/${args.idOrName}`);
    if (!ok) return { ok: false, error: `HTTP ${status}`, data };
    const d = data as Record<string, unknown>;
    return {
      ok: true,
      data: {
        id: d.id,
        name: d.name,
        framework: d.framework,
        nodeVersion: d.nodeVersion,
        target: d.targets,
        gitRepository: d.link ? { repo: (d.link as Record<string, unknown>).repo, org: (d.link as Record<string, unknown>).org, type: (d.link as Record<string, unknown>).type } : null,
        installCommand: d.installCommand,
        buildCommand: d.buildCommand,
        outputDirectory: d.outputDirectory,
        rootDirectory: d.rootDirectory,
      },
    };
  }

  private async deploymentList(args: Record<string, unknown>): Promise<McpToolResult> {
    const projectId = String(args.projectId ?? "");
    if (!projectId) return { ok: false, error: "projectId required" };
    const limit = Math.min(Math.max(Math.trunc(Number(args.limit ?? 20)), 1), 100);
    let url = `/v6/deployments?projectId=${projectId}&limit=${limit}`;
    if (args.state) url += `&state=${args.state}`;
    if (args.target) url += `&target=${args.target}`;
    const { data, ok, status } = await this.vercel(url);
    if (!ok) return { ok: false, error: `HTTP ${status}`, data };
    const deployments = ((data as { deployments?: Record<string, unknown>[] })?.deployments ?? []) as Record<string, unknown>[];
    return {
      ok: true,
      data: deployments.map((d) => ({
        uid: d.uid,
        url: d.url,
        state: d.readyState,
        target: d.target,
        branch: (d.meta as Record<string, unknown>)?.githubCommitRef,
        created: d.created,
        inspectorUrl: d.inspectorUrl,
      })),
      meta: { count: deployments.length },
    };
  }

  private async deploymentGet(args: Record<string, unknown>): Promise<McpToolResult> {
    const { data, ok, status } = await this.vercel(`/v13/deployments/${args.idOrUrl}`);
    if (!ok) return { ok: false, error: `HTTP ${status}`, data };
    const d = data as Record<string, unknown>;
    return {
      ok: true,
      data: {
        uid: d.uid,
        url: d.url,
        state: d.readyState,
        target: d.target,
        ready: d.readyState === "READY",
        readySince: d.ready,
        branch: (d.meta as Record<string, unknown>)?.githubCommitRef,
        commitSha: (d.meta as Record<string, unknown>)?.githubCommitSha,
        created: d.created,
        inspectorUrl: d.inspectorUrl,
        error: d.readyState === "ERROR" ? (d as { errorMessage?: string }).errorMessage : null,
      },
    };
  }

  private async deploymentRedeploy(args: Record<string, unknown>): Promise<McpToolResult> {
    const deploymentId = String(args.deploymentId ?? "");
    if (!deploymentId) return { ok: false, error: "deploymentId required" };
    const target = String(args.target ?? "production");
    const { data, ok, status } = await this.vercel(`/v13/deployments/${deploymentId}/redeploy`, {
      method: "POST",
      body: JSON.stringify({ target, name: undefined }),
    });
    if (!ok) return { ok: false, error: `HTTP ${status}`, data };
    const d = data as Record<string, unknown>;
    return {
      ok: true,
      data: { id: d.id ?? d.uid, url: d.url, state: d.readyState },
      meta: { redeployed: deploymentId, target },
    };
  }

  private async envList(args: Record<string, unknown>): Promise<McpToolResult> {
    const projectId = String(args.projectId ?? "");
    if (!projectId) return { ok: false, error: "projectId required" };
    const { data, ok, status } = await this.vercel(`/v9/projects/${projectId}/env`);
    if (!ok) return { ok: false, error: `HTTP ${status}`, data };
    const envs = ((data as { envs?: Record<string, unknown>[] })?.envs ?? []) as Record<string, unknown>[];
    const filtered = args.target ? envs.filter((e) => Array.isArray(e.target) && (e.target as string[]).includes(String(args.target))) : envs;
    return {
      ok: true,
      data: filtered.map((e) => ({
        id: e.id,
        key: e.key,
        type: e.type,
        target: e.target,
        value: e.type === "plain" ? e.value : "[encrypted]",
      })),
      meta: { count: filtered.length },
    };
  }

  private async envCreate(args: Record<string, unknown>): Promise<McpToolResult> {
    const projectId = String(args.projectId ?? "");
    const key = String(args.key ?? "");
    const value = String(args.value ?? "");
    if (!projectId || !key) return { ok: false, error: "projectId and key required" };
    const body = {
      key,
      value,
      type: String(args.type ?? "encrypted"),
      target: Array.isArray(args.target) ? args.target : ["production", "preview", "development"],
    };
    const { data, ok, status } = await this.vercel(`/v9/projects/${projectId}/env`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!ok) return { ok: false, error: `HTTP ${status}`, data };
    const d = data as Record<string, unknown>;
    return { ok: true, data: { id: d.id, key: d.key, type: d.type, target: d.target } };
  }

  private async envDelete(args: Record<string, unknown>): Promise<McpToolResult> {
    const projectId = String(args.projectId ?? "");
    const envId = String(args.envId ?? "");
    if (!projectId || !envId) return { ok: false, error: "projectId and envId required" };
    const { ok, status } = await this.vercel(`/v9/projects/${projectId}/env/${envId}`, { method: "DELETE" });
    if (!ok) return { ok: false, error: `HTTP ${status}` };
    return { ok: true, data: { deleted: envId } };
  }

  private async deploymentCreate(args: Record<string, unknown>): Promise<McpToolResult> {
    const projectId = String(args.projectId ?? "");
    const ref = String(args.ref ?? "");
    if (!projectId || !ref) return { ok: false, error: "projectId and ref required" };
    const target = String(args.target ?? "preview");
    const { data, ok, status } = await this.vercel(`/v13/deployments`, {
      method: "POST",
      body: JSON.stringify({
        projectId,
        gitSource: { type: "github", ref },
        target,
      }),
    });
    if (!ok) return { ok: false, error: `HTTP ${status}`, data };
    const d = data as Record<string, unknown>;
    return {
      ok: true,
      data: { id: d.id ?? d.uid, url: d.url, state: d.readyState, target, ref },
    };
  }
}
