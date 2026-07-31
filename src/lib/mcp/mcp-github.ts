/**
 * NOVA AGI — GitHub MCP Connector
 *
 * Read tools execute inside the authenticated NOVA runtime. Every mutation is
 * represented with the same tool contract consumed by Hocker ONE and is
 * deferred to its Owner Gate.
 */

import {
  McpConnector,
  type McpConnectorConfig,
  type McpToolResult,
  type McpToolSchema,
} from "./mcp-connector.js";

const GITHUB_API = "https://api.github.com";
const SAFE_REPOSITORY_PART = /^[a-z0-9_.-]+$/i;
const SAFE_REF = /^[a-z0-9_./-]+$/i;
const MAX_FILE_BYTES = 64 * 1024;
const MUTATION_TOOLS = new Set([
  "create_branch",
  "create_or_update_file",
  "create_pull_request",
  "create_issue",
]);

const DEFAULT_REPOSITORIES = [
  "HockerAGI/hocker.one",
  "HockerAGI/nova.agi",
  "HockerAGI/hocker-node-agent",
] as const;

const GITHUB_TOOLS: McpToolSchema[] = [
  {
    name: "get_repository",
    description: "Get metadata for an allowlisted HOCKER repository.",
    inputSchema: {
      type: "object",
      properties: { owner: { type: "string" }, repo: { type: "string" } },
      required: ["owner", "repo"],
    },
  },
  {
    name: "list_tree",
    description: "List the recursive Git tree for an allowlisted repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        ref: { type: "string" },
        path: { type: "string" },
        limit: { type: "number" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "get_file_contents",
    description: "Read a text file or directory listing from an allowlisted repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        path: { type: "string" },
        ref: { type: "string" },
      },
      required: ["owner", "repo", "path"],
    },
  },
  {
    name: "list_pull_requests",
    description: "List pull requests for an allowlisted repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        state: { type: "string" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "list_issues",
    description: "List issues for an allowlisted repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        state: { type: "string" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "create_branch",
    description: "Prepare creation of a non-main branch for Hocker ONE Owner Gate approval.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        branch: { type: "string" },
        from: { type: "string" },
      },
      required: ["owner", "repo", "branch"],
    },
  },
  {
    name: "create_or_update_file",
    description: "Prepare a branch file change for Hocker ONE Owner Gate approval.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        branch: { type: "string" },
        path: { type: "string" },
        content: { type: "string" },
        message: { type: "string" },
        sha: { type: "string" },
      },
      required: ["owner", "repo", "branch", "path", "content", "message"],
    },
  },
  {
    name: "create_pull_request",
    description: "Prepare a pull request for Hocker ONE Owner Gate approval.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        title: { type: "string" },
        head: { type: "string" },
        base: { type: "string" },
        body: { type: "string" },
        draft: { type: "boolean" },
      },
      required: ["owner", "repo", "title", "head", "base"],
    },
  },
  {
    name: "create_issue",
    description: "Prepare a GitHub issue for Hocker ONE Owner Gate approval.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
        labels: { type: "array" },
      },
      required: ["owner", "repo", "title"],
    },
  },
];

function envList(name: string, fallback: readonly string[]): string[] {
  const raw = String(process.env[name] ?? "").trim();
  return (raw ? raw.split(",") : [...fallback])
    .map((item) => item.trim())
    .filter(Boolean);
}

function allowedRepositories(): Set<string> {
  return new Set(
    envList("NOVA_GITHUB_ALLOWED_REPOS", DEFAULT_REPOSITORIES)
      .map((item) => item.toLowerCase()),
  );
}

function repository(args: Record<string, unknown>): {
  owner: string;
  repo: string;
  fullName: string;
} {
  const owner = String(args.owner ?? "").trim();
  const repo = String(args.repo ?? "").trim();

  if (!SAFE_REPOSITORY_PART.test(owner) || !SAFE_REPOSITORY_PART.test(repo)) {
    throw new Error("Repositorio GitHub inválido.");
  }

  const fullName = `${owner}/${repo}`;
  if (!allowedRepositories().has(fullName.toLowerCase())) {
    throw new Error(`Repositorio fuera de allowlist NOVA: ${fullName}`);
  }

  return { owner, repo, fullName };
}

function safeRef(value: unknown, fallback = "HEAD"): string {
  const ref = String(value ?? fallback).trim() || fallback;
  if (ref.length > 160 || !SAFE_REF.test(ref) || ref.includes("..")) {
    throw new Error("Ref GitHub inválida.");
  }
  return ref;
}

function safePath(value: unknown, allowEmpty = false): string {
  const path = String(value ?? "").trim().replace(/^\/+/, "");
  if (!path && allowEmpty) return "";
  if (!path || path.length > 500 || path.includes("..") || path.includes("\\") || /[\r\n?#]/.test(path)) {
    throw new Error("Path GitHub inválido.");
  }
  return path;
}

function safeState(value: unknown): "open" | "closed" | "all" {
  const state = String(value ?? "open").trim().toLowerCase();
  return state === "closed" || state === "all" ? state : "open";
}

function mutationBlocked(): McpToolResult {
  return {
    ok: false,
    error: "MCP_MUTATION_REQUIRES_HOCKER_ONE_OWNER_GATE",
  };
}

export class GitHubMcpConnector extends McpConnector {
  private token: string;

  constructor() {
    const config: McpConnectorConfig = {
      id: "github",
      name: "GitHub MCP",
      transport: "http",
      timeoutMs: 30_000,
      enabled: true,
      requiredEnv: [],
    };
    super(config);
    this.token = String(
      process.env.GITHUB_TOKEN ??
        process.env.HOCKER_GITHUB_TOKEN ??
        process.env.GH_TOKEN ??
        "",
    ).trim();
  }

  override isConfigured(): boolean {
    return this.token.length > 0;
  }

  async initialize(): Promise<{ capabilities: string[]; tools: McpToolSchema[] }> {
    if (!this.isConfigured()) {
      this.markError("GitHub token missing");
      return { capabilities: [], tools: [] };
    }
    if (!(await this.ping())) {
      this.markError("GitHub API ping failed");
      return { capabilities: [], tools: [] };
    }

    this.setTools(GITHUB_TOOLS);
    this.markConnected(["repository-read", "owner-gated-mutations"]);
    return { capabilities: this.state.capabilities, tools: GITHUB_TOOLS };
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${GITHUB_API}/user`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(8000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    };
  }

  private async gh(endpoint: string): Promise<{
    ok: boolean;
    status: number;
    data: unknown;
  }> {
    const res = await fetch(`${GITHUB_API}${endpoint}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<McpToolResult> {
    if (!this.isConfigured()) return { ok: false, error: "GitHub not configured" };
    if (MUTATION_TOOLS.has(toolName)) return mutationBlocked();

    try {
      switch (toolName) {
        case "get_repository":
          return await this.getRepository(args);
        case "list_tree":
          return await this.listTree(args);
        case "get_file_contents":
          return await this.getFileContents(args);
        case "list_pull_requests":
          return await this.listPullRequests(args);
        case "list_issues":
          return await this.listIssues(args);
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

  private async getRepository(args: Record<string, unknown>): Promise<McpToolResult> {
    const target = repository(args);
    const { data, ok, status } = await this.gh(
      `/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`,
    );
    if (!ok) return { ok: false, error: `HTTP ${status}`, data };

    const item = data as Record<string, unknown>;
    return {
      ok: true,
      data: {
        full_name: item.full_name,
        default_branch: item.default_branch,
        private: item.private,
        archived: item.archived,
        pushed_at: item.pushed_at,
      },
    };
  }

  private async listTree(args: Record<string, unknown>): Promise<McpToolResult> {
    const target = repository(args);
    const ref = safeRef(args.ref);
    const requestedPath = safePath(args.path, true).toLowerCase();
    const limit = Math.min(Math.max(Math.trunc(Number(args.limit ?? 500)), 1), 1000);
    const { data, ok, status } = await this.gh(
      `/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    );
    if (!ok) return { ok: false, error: `HTTP ${status}`, data };

    const response = data as {
      truncated?: boolean;
      tree?: Array<Record<string, unknown>>;
    };
    const tree = (response.tree ?? [])
      .filter((item) => typeof item.path === "string")
      .filter((item) => {
        if (!requestedPath) return true;
        const path = String(item.path).toLowerCase();
        return path === requestedPath || path.startsWith(`${requestedPath}/`);
      });
    const selected = tree.slice(0, limit).map((item) => ({
      path: item.path,
      type: item.type,
      size: item.size ?? null,
      sha: item.sha ?? null,
    }));

    return {
      ok: true,
      data: selected,
      meta: {
        repository: target.fullName,
        count: selected.length,
        truncated: Boolean(response.truncated) || tree.length > selected.length,
      },
    };
  }

  private async getFileContents(args: Record<string, unknown>): Promise<McpToolResult> {
    const target = repository(args);
    const ref = safeRef(args.ref);
    const path = safePath(args.path);
    const { data, ok, status } = await this.gh(
      `/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`,
    );
    if (!ok) return { ok: false, error: `HTTP ${status}`, data };

    if (Array.isArray(data)) {
      return {
        ok: true,
        data: data.map((item: Record<string, unknown>) => ({
          name: item.name,
          path: item.path,
          type: item.type,
          size: item.size,
          sha: item.sha,
        })),
        meta: { repository: target.fullName, path, type: "directory" },
      };
    }

    const item = data as {
      content?: string;
      encoding?: string;
      size?: number;
      sha?: string;
      path?: string;
    };
    if (item.encoding !== "base64" || !item.content) {
      return { ok: false, error: "GitHub no devolvió un archivo de texto base64." };
    }

    const decoded = Buffer.from(item.content.replace(/\n/g, ""), "base64").toString("utf8");
    const bytes = Buffer.byteLength(decoded, "utf8");
    const content = bytes > MAX_FILE_BYTES ? decoded.slice(0, MAX_FILE_BYTES) : decoded;

    return {
      ok: true,
      data: {
        repository: target.fullName,
        ref,
        path: item.path ?? path,
        sha: item.sha ?? null,
        size: item.size ?? bytes,
        truncated: bytes > MAX_FILE_BYTES,
        content,
      },
    };
  }

  private async listPullRequests(args: Record<string, unknown>): Promise<McpToolResult> {
    const target = repository(args);
    const state = safeState(args.state);
    const { data, ok, status } = await this.gh(
      `/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/pulls?state=${state}&per_page=30`,
    );
    if (!ok) return { ok: false, error: `HTTP ${status}`, data };

    return {
      ok: true,
      data: (data as Record<string, unknown>[]).map((item) => ({
        number: item.number,
        title: item.title,
        state: item.state,
        draft: item.draft,
        head: (item.head as Record<string, unknown> | undefined)?.ref,
        base: (item.base as Record<string, unknown> | undefined)?.ref,
      })),
    };
  }

  private async listIssues(args: Record<string, unknown>): Promise<McpToolResult> {
    const target = repository(args);
    const state = safeState(args.state);
    const { data, ok, status } = await this.gh(
      `/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/issues?state=${state}&per_page=30`,
    );
    if (!ok) return { ok: false, error: `HTTP ${status}`, data };

    return {
      ok: true,
      data: (data as Record<string, unknown>[])
        .filter((item) => !("pull_request" in item))
        .map((item) => ({
          number: item.number,
          title: item.title,
          state: item.state,
        })),
    };
  }
}
