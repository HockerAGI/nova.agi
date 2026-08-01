import type { ChatMessage, CompletionResult } from "../types.js";

export type NativeToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type NativeToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

export type CompletionWithTools = CompletionResult & {
  toolCalls?: NativeToolCall[];
};

type AnthropicContentBlock =
  | { type: "text"; text?: string }
  | { type: "tool_use"; id?: string; name?: string; input?: Record<string, unknown> };

type AnthropicResponse = {
  content?: AnthropicContentBlock[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: { message?: string };
};

/** Convert OpenAI-style tool defs to Anthropic tools format. */
function toAnthropicTools(
  tools: NativeToolDef[] | undefined,
): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

function normalizeUsage(
  usage: AnthropicResponse["usage"],
): CompletionResult["usage"] | undefined {
  const tokensIn =
    typeof usage?.input_tokens === "number" ? usage.input_tokens : undefined;
  const tokensOut =
    typeof usage?.output_tokens === "number" ? usage.output_tokens : undefined;

  if (tokensIn === undefined && tokensOut === undefined) return undefined;

  const normalized: NonNullable<CompletionResult["usage"]> = {};
  if (tokensIn !== undefined) normalized.tokens_in = tokensIn;
  if (tokensOut !== undefined) normalized.tokens_out = tokensOut;
  return normalized;
}

export async function anthropicRespond(args: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  timeoutMs: number;
  maxTokens?: number;
  tools?: NativeToolDef[];
}): Promise<CompletionWithTools> {
  if (!args.apiKey?.trim()) throw new Error("Anthropic API key is empty or missing");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);

  try {
    const system = args.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const userMessages = args.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));

    const body: Record<string, unknown> = {
      model: args.model,
      max_tokens: args.maxTokens ?? 4096,
      system,
      messages: userMessages,
    };

    const tools = toAnthropicTools(args.tools);
    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = { type: "auto" };
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-api-key": args.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json().catch(() => ({}))) as AnthropicResponse;

    if (!res.ok) throw new Error(json.error?.message || `Anthropic HTTP ${res.status}`);

    const blocks = json.content ?? [];
    const textParts: string[] = [];
    const toolCalls: NativeToolCall[] = [];

    for (const block of blocks) {
      if (!block || typeof block !== "object") continue;
      if (block.type === "text" && typeof block.text === "string") {
        textParts.push(block.text);
      } else if (block.type === "tool_use" && block.name) {
        toolCalls.push({
          id: String(block.id || `acall_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
          name: block.name,
          args: (block.input && typeof block.input === "object" ? block.input : {}) as Record<string, unknown>,
        });
      }
    }

    const text = textParts.join("").trim();
    const usage = normalizeUsage(json.usage);
    const result: CompletionWithTools = {
      provider: "anthropic",
      model: args.model,
      text,
      fallbackUsed: false,
    };
    if (usage) result.usage = usage;
    if (toolCalls.length > 0) result.toolCalls = toolCalls;
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Anthropic timeout después de ${args.timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
