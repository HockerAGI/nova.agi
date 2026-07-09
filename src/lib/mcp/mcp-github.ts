/**
 * NOVA AGI — GitHub MCP Connector
 *
 * Connects NOVA to GitHub repositories for code management:
 * reading files, listing trees, creating branches, commits, and PRs.
 *
 * Tools exposed:
 *  - repo.get          : Get repository metadata
 *  - repo.list_tree    : List files in a repo path
 *  - repo.read_file    : Read a file's content
 *  - repo.create_branch: Create a new branch
 *  - repo.create_commit: Create a commit on a branch
 *  - repo.create_pr    : Create a pull request
 *  - repo.list_prs     : List pull requests
 *  - repo.list_issues  : List issues
 *  - repo.create_issue : Create an issue
 */

import { McpConnector, type McpConnectorConfig, type McpToolResult, type McpToolSchema } from "./mcp-connector.js";

const GITHUB_TOOLS: McpToolSchema[] = [
  { name: "repo.get", description: "Get repository metadata.", inputSchema: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" } }, required: ["owner", "repo"] } },
  { name: "repo.list_tree", description: "List files in a repository path.", inputSchema: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, path: { type: "string" }, ref: { type: "string" } }, required: ["owner", "repo"] } },
  { name: "repo.read_file", description: "Read a file from a repository.", inputSchema: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, path: { type: "string" }, ref: { type: "string" } }, required: ["owner", "repo", "path"] } },
  { name: "repo.create_branch", description: "Create a new branch from a base ref.", inputSchema: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, branch: { type: "string" }, from: { type: "string" } }, required: ["owner", "repo", "branch"] } },
  { name: "repo.create_commit", description: "Create or update a file via a commit.", inputSchema: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, branch: { type: "string" }, path: { type: "string" }, content: { type: "string" }, message: { type: "string" } }, required: ["owner", "repo", "branch", "path", "content", "message"] } },
  { name: "repo.create_pr", description: "Create a pull request.", inputSchema: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, title: { type: "string" }, head: { type: "string" }, base: { type: "string" }, body: { type: "string" } }, required: ["owner", "repo", "title", "head", "base"] } },
  { name: "repo.list_prs", description: "List pull requests.", inputSchema: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, state: { type: "string" } }, required: ["owner", "repo"] } },
  { name: "repo.list_issues", description: "List repository issues.", inputSchema: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, state: { type: "string" } }, required: ["owner", "repo"] } },
  { name: "repo.create_issue", description: "Create a repository issue.", inputSchema: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, title: { type: "string" }, body: { type: "string" }, labels: { type: "array" } }, required: ["owner", "repo", "title"] } },
];

const GITHUB_API = "https://api.github.com";

export class GitHubMcpConnector extends McpConnector {
  private token: string;

  constructor() {
    const config: McpConnectorConfig = {
      id: "github",
      name: "GitHub MCP",
      transport: "http",
      timeoutMs: 30_000,
      enabled: true,
      requiredEnv: ["GITHUB_TOKEN"],
    };
    super(config);
    this.token = String(process.env.GITHUB_TOKEN ?? process.env.HOCKER_GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "");
  }

  async initialize(): Promise<{ capabilities: string[]; tools: McpToolSchema[] }> {
    if (!this.isConfigured()) {
      this.markError("GITHUB_TOKEN missing");
      return { capabilities: [], tools: [] };
    }
    const connected = await this.ping();
    if (!connected) {
      this.markError("GitHub API ping failed");
      return { capabilities: [], tools: [] };
    }
    this.setTools(GITHUB_TOOLS);
    this.markConnected(["repos", "issues", "pull-requests", "branches", "commits"]);
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

  async callTool(toolName: string, args: Record<string, unknown>): Promise<McpToolResult> {
    if (!this.isConfigured()) return { ok: false, error: "GitHub not configured" };
    try {
      switch (toolName) {
        case "repo.get": return await this.repoGet(args);
        case "repo.list_tree": return await this.listTree(args);
        case "repo.read_file": return await this.readFile(args);
        case "repo.create_branch": return await this.createBranch(args);
        case "repo.create_commit": return await this.createCommit(args);
        case "repo.create_pr": return await this.createPR(args);
        case "repo.list_prs": return await this.listPRs(args);
        case "repo.list_issues": return await this.listIssues(args);
        case "repo.create_issue": return await this.createIssue(args);
        default: return { ok: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  private async gh(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: unknown }> {
    const res = await fetch(`${GITHUB_API}${url}`, {
      ...init,
      headers: this.headers(),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  }

  private async repoGet(args: Record<string, unknown>): Promise<McpToolResult> {
    const { data, ok, status } = await this.gh(`/repos/${args.owner}/${args.repo}`);
    if (!ok) return { ok: false, error: `HTTP ${status}`, data };
    return { ok: true, data: { full_name: (data as { full_name?: string }).full_name, default_branch: (data as { default_branch?: string }).default_branch, private: (data as { private?: boolean }).private } };
  }

  private async listTree(args: Record<string, unknown>): Promise<McpToolResult> {
    const ref = String(args.ref ?? "HEAD");
    const path = String(args.path ?? "");
    const { data, ok, status } = await this.gh(`/repos/${args.owner}/${args.repo}/contents/${path}?ref=${ref}`);
    if (!ok) return { ok: false, error: `HTTP ${status}`, data };
    const items = Array.isArray(data) ? data : [data];
    return { ok: true, data: items.map((i: Record<string, unknown>) => ({ name: i.name, type: i.type, path: i.path, size: i.size })), meta: { count: items.length } };
  }

  private async readFile(args: Record<string, unknown>): Promise<McpToolResult> {
    const ref = String(args.ref ?? "HEAD");
    const { data, ok, status } = await this.gh(`/repos/${args.owner}/${args.repo}/contents/${args.path}?ref=${ref}`);
    if (!ok) return { ok: false, error: `HTTP ${status}`, data };
    const d = data as { content?: string; encoding?: string };
    const content = d.encoding === "base64" && d.content ? Buffer.from(d.content.replace(/\n/g, ""), "base64").toString("utf-8") : "";
    return { ok: true, data: { content } };
  }

  private async createBranch(args: Record<string, unknown>): Promise<McpToolResult> {
    const from = String(args.from ?? "main");
    const { data: refData, ok, status } = await this.gh(`/repos/${args.owner}/${args.repo}/git/refs/heads/${from}`);
    if (!ok) return { ok: false, error: `Base ref not found: HTTP ${status}` };
    const sha = (refData as { object?: { sha?: string } }).object?.sha;
    if (!sha) return { ok: false, error: "Could not resolve base SHA" };
    const res = await this.gh(`/repos/${args.owner}/${args.repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${args.branch}`, sha }),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, data: res.data };
    return { ok: true, data: { branch: args.branch, from, sha } };
  }

  private async createCommit(args: Record<string, unknown>): Promise<McpToolResult> {
    const res = await this.gh(`/repos/${args.owner}/${args.repo}/contents/${args.path}`, {
      method: "PUT",
      body: JSON.stringify({ message: args.message, content: Buffer.from(String(args.content), "utf-8").toString("base64"), branch: args.branch }),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, data: res.data };
    const d = res.data as { commit?: { sha?: string } };
    return { ok: true, data: { path: args.path, branch: args.branch, sha: d.commit?.sha } };
  }

  private async createPR(args: Record<string, unknown>): Promise<McpToolResult> {
    const res = await this.gh(`/repos/${args.owner}/${args.repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({ title: args.title, head: args.head, base: args.base, body: args.body ?? "" }),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, data: res.data };
    const d = res.data as { number?: number; html_url?: string };
    return { ok: true, data: { number: d.number, url: d.html_url } };
  }

  private async listPRs(args: Record<string, unknown>): Promise<McpToolResult> {
    const state = String(args.state ?? "open");
    const { data, ok, status } = await this.gh(`/repos/${args.owner}/${args.repo}/pulls?state=${state}&per_page=30`);
    if (!ok) return { ok: false, error: `HTTP ${status}` };
    return { ok: true, data: (data as Record<string, unknown>[]).map((p) => ({ number: p.number, title: p.title, state: p.state, user: (p.user as { login?: string })?.login })) };
  }

  private async listIssues(args: Record<string, unknown>): Promise<McpToolResult> {
    const state = String(args.state ?? "open");
    const { data, ok, status } = await this.gh(`/repos/${args.owner}/${args.repo}/issues?state=${state}&per_page=30`);
    if (!ok) return { ok: false, error: `HTTP ${status}` };
    return { ok: true, data: (data as Record<string, unknown>[]).map((i) => ({ number: i.number, title: i.title, state: i.state })) };
  }

  private async createIssue(args: Record<string, unknown>): Promise<McpToolResult> {
    const res = await this.gh(`/repos/${args.owner}/${args.repo}/issues`, {
      method: "POST",
      body: JSON.stringify({ title: args.title, body: args.body ?? "", labels: args.labels ?? [] }),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, data: res.data };
    const d = res.data as { number?: number; html_url?: string };
    return { ok: true, data: { number: d.number, url: d.html_url } };
  }
}
