/**
 * NOVA AGI — OpenAI MCP Connector
 *
 * Connects NOVA to OpenAI's platform for embedding, moderation,
 * image generation, and structured output capabilities — the same
 * integration pattern used by Claude, Replit Agent, and Codex.
 *
 * Tools exposed:
 *  - embed.create       : Create embeddings for text
 *  - moderate           : Moderate text content
 *  - image.generate     : Generate images from text (DALL-E)
 *  - audio.transcribe   : Transcribe audio (Whisper)
 *  - audio.tts          : Text-to-speech
 *  - model.list         : List available models
 *  - chat.structured    : Structured chat completion with JSON schema output
 */

import { McpConnector, type McpConnectorConfig, type McpToolResult, type McpToolSchema } from "./mcp-connector.js";

const OPENAI_TOOLS: McpToolSchema[] = [
  {
    name: "embed.create",
    description: "Create embeddings for an array of text inputs using OpenAI embeddings.",
    inputSchema: {
      type: "object",
      properties: {
        inputs: { type: "array", items: { type: "string" }, description: "Text inputs to embed" },
        model: { type: "string", description: "Embedding model (default text-embedding-3-small)" },
      },
      required: ["inputs"],
    },
  },
  {
    name: "moderate",
    description: "Moderate text content for policy violations using OpenAI moderation.",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Text to moderate" },
      },
      required: ["input"],
    },
  },
  {
    name: "image.generate",
    description: "Generate images from a text prompt using DALL-E.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        size: { type: "string", description: "256x256, 512x512, or 1024x1024 (default 1024x1024)" },
        quality: { type: "string", description: "standard or hd (default standard)" },
        n: { type: "number", description: "Number of images (default 1, max 1 for hd)" },
      },
      required: ["prompt"],
    },
  },
  {
    name: "audio.transcribe",
    description: "Transcribe audio to text using Whisper. Accepts a URL or base64 audio.",
    inputSchema: {
      type: "object",
      properties: {
        audioUrl: { type: "string", description: "Public URL of the audio file" },
        model: { type: "string", description: "Whisper model (default whisper-1)" },
      },
      required: ["audioUrl"],
    },
  },
  {
    name: "audio.tts",
    description: "Convert text to speech using OpenAI TTS.",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Text to synthesize" },
        voice: { type: "string", description: "alloy, echo, fable, onyx, nova, or shimmer (default alloy)" },
        model: { type: "string", description: "tts-1 or tts-1-hd (default tts-1)" },
      },
      required: ["input"],
    },
  },
  {
    name: "model.list",
    description: "List available OpenAI models.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "chat.structured",
    description: "Structured chat completion with JSON output schema. Use for tool-calling-style structured reasoning.",
    inputSchema: {
      type: "object",
      properties: {
        messages: { type: "array", items: { type: "object" }, description: "Chat messages" },
        model: { type: "string", description: "Model (default gpt-4o-mini)" },
        temperature: { type: "number" },
        jsonSchema: { type: "object", description: "JSON schema for structured output" },
      },
      required: ["messages"],
    },
  },
];

const OPENAI_API = "https://api.openai.com/v1";

export class OpenAiMcpConnector extends McpConnector {
  private apiKey: string;
  private org: string;

  constructor() {
    const config: McpConnectorConfig = {
      id: "openai",
      name: "OpenAI MCP",
      transport: "http",
      timeoutMs: 60_000,
      enabled: true,
      requiredEnv: ["OPENAI_API_KEY"],
    };
    super(config);
    this.apiKey = String(process.env.OPENAI_API_KEY ?? process.env.HOCKER_OPENAI_API_KEY ?? "");
    this.org = String(process.env.OPENAI_ORG_ID ?? "").trim();
  }

  async initialize(): Promise<{ capabilities: string[]; tools: McpToolSchema[] }> {
    if (!this.isConfigured()) {
      this.markError("OPENAI_API_KEY missing");
      return { capabilities: [], tools: [] };
    }
    const connected = await this.ping();
    if (!connected) {
      this.markError("OpenAI API ping failed");
      return { capabilities: [], tools: [] };
    }
    this.setTools(OPENAI_TOOLS);
    this.markConnected(["embeddings", "moderation", "images", "audio", "chat", "models"]);
    return { capabilities: this.state.capabilities, tools: OPENAI_TOOLS };
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${OPENAI_API}/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(8000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (this.org) h["OpenAI-Organization"] = this.org;
    return h;
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<McpToolResult> {
    if (!this.isConfigured()) return { ok: false, error: "OpenAI not configured" };
    try {
      switch (toolName) {
        case "embed.create": return await this.embedCreate(args);
        case "moderate": return await this.moderate(args);
        case "image.generate": return await this.imageGenerate(args);
        case "audio.transcribe": return await this.audioTranscribe(args);
        case "audio.tts": return await this.audioTts(args);
        case "model.list": return await this.modelList();
        case "chat.structured": return await this.chatStructured(args);
        default: return { ok: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  private async postJSON(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: unknown }> {
    const res = await fetch(`${OPENAI_API}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  }

  private async embedCreate(args: Record<string, unknown>): Promise<McpToolResult> {
    const inputs = args.inputs;
    if (!Array.isArray(inputs) || inputs.length === 0) return { ok: false, error: "inputs[] required" };
    const model = String(args.model ?? "text-embedding-3-small");
    const { ok, status, data } = await this.postJSON("/embeddings", { input: inputs, model });
    if (!ok) return { ok: false, error: `HTTP ${status}`, data };
    const d = data as { data?: Array<{ embedding?: number[]; index?: number }> };
    return {
      ok: true,
      data: (d.data ?? []).map((item) => ({ index: item.index, dimensions: item.embedding?.length ?? 0, embedding: item.embedding?.slice(0, 8) })),
      meta: { model, count: d.data?.length ?? 0 },
    };
  }

  private async moderate(args: Record<string, unknown>): Promise<McpToolResult> {
    const input = String(args.input ?? "");
    if (!input) return { ok: false, error: "input required" };
    const { ok, status, data } = await this.postJSON("/moderations", { input, model: "omni-moderation-latest" });
    if (!ok) return { ok: false, error: `HTTP ${status}`, data };
    return { ok: true, data };
  }

  private async imageGenerate(args: Record<string, unknown>): Promise<McpToolResult> {
    const prompt = String(args.prompt ?? "");
    if (!prompt) return { ok: false, error: "prompt required" };
    const n = Math.min(Math.max(Math.trunc(Number(args.n ?? 1)), 1), 4);
    const quality = String(args.quality ?? "standard");
    const size = String(args.size ?? "1024x1024");
    const model = quality === "hd" ? "dall-e-3" : "dall-e-2";
    const body: Record<string, unknown> = {
      model,
      prompt,
      n: model === "dall-e-3" ? 1 : n,
      size,
      response_format: "url",
    };
    if (model === "dall-e-3") body.quality = quality;
    const { ok, status, data } = await this.postJSON("/images/generations", body);
    if (!ok) return { ok: false, error: `HTTP ${status}`, data };
    const d = data as { data?: Array<{ url?: string; revised_prompt?: string }> };
    return {
      ok: true,
      data: (d.data ?? []).map((img) => ({ url: img.url, revisedPrompt: img.revised_prompt })),
      meta: { model, count: d.data?.length ?? 0 },
    };
  }

  private async audioTranscribe(args: Record<string, unknown>): Promise<McpToolResult> {
    const audioUrl = String(args.audioUrl ?? "");
    if (!audioUrl) return { ok: false, error: "audioUrl required" };
    const model = String(args.model ?? "whisper-1");
    const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(30_000) });
    if (!audioRes.ok) return { ok: false, error: `Failed to fetch audio: HTTP ${audioRes.status}` };
    const audioBlob = await audioRes.blob();
    const form = new FormData();
    form.append("file", audioBlob, "audio.wav");
    form.append("model", model);
    const res = await fetch(`${OPENAI_API}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, data };
    const d = data as { text?: string };
    return { ok: true, data: { text: d.text ?? "" }, meta: { model } };
  }

  private async audioTts(args: Record<string, unknown>): Promise<McpToolResult> {
    const input = String(args.input ?? "");
    if (!input) return { ok: false, error: "input required" };
    const voice = String(args.voice ?? "alloy");
    const model = String(args.model ?? "tts-1");
    const res = await fetch(`${OPENAI_API}/audio/speech`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ model, input, voice, response_format: "mp3" }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return { ok: false, error: `HTTP ${res.status}`, data };
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return {
      ok: true,
      data: { audioBase64: buffer.toString("base64"), format: "mp3", size: buffer.length },
      meta: { model, voice },
    };
  }

  private async modelList(): Promise<McpToolResult> {
    const res = await fetch(`${OPENAI_API}/models`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, data };
    const d = data as { data?: Array<{ id?: string; owned_by?: string }> };
    return {
      ok: true,
      data: (d.data ?? []).map((m) => ({ id: m.id, ownedBy: m.owned_by })),
      meta: { count: d.data?.length ?? 0 },
    };
  }

  private async chatStructured(args: Record<string, unknown>): Promise<McpToolResult> {
    const messages = args.messages;
    if (!Array.isArray(messages)) return { ok: false, error: "messages[] required" };
    const model = String(args.model ?? "gpt-4o-mini");
    const temperature = Number(args.temperature ?? 0.2);
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature,
      response_format: { type: "json_object" },
    };
    if (args.jsonSchema) {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: "nova_structured_output",
          schema: args.jsonSchema,
          strict: true,
        },
      };
    }
    const { ok, status, data } = await this.postJSON("/chat/completions", body);
    if (!ok) return { ok: false, error: `HTTP ${status}`, data };
    const d = data as { choices?: Array<{ message?: { content?: string; tool_calls?: unknown[] } }>; usage?: Record<string, number> };
    const content = d.choices?.[0]?.message?.content ?? "";
    let parsed: unknown = content;
    try { parsed = JSON.parse(content); } catch { /* keep as string */ }
    return {
      ok: true,
      data: { content: parsed, raw: content },
      meta: {
        model,
        tokens_in: d.usage?.prompt_tokens,
        tokens_out: d.usage?.completion_tokens,
      },
    };
  }
}
