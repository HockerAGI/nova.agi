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

type OpenAIChatContentPart =
  | { type?: "text"; text?: string }
  | { type?: string; [key: string]: unknown };

type OpenAIMessage = {
  content?: string | OpenAIChatContentPart[] | null;
};

type OpenAIToolCallRaw = {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
};

type OpenAIResponse = {
  choices?: Array<{
    message?: OpenAIMessage & { tool_calls?: OpenAIToolCallRaw[] };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

function extractTextContent(content: OpenAIMessage["content"]): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        if (part.type === "text" && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();

    return text;
  }

  return "";
}

function normalizeUsage(
  usage: OpenAIResponse["usage"],
): CompletionResult["usage"] | undefined {
  const tokensIn =
    typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : undefined;
  const tokensOut =
    typeof usage?.completion_tokens === "number" ? usage.completion_tokens : undefined;

  if (tokensIn === undefined && tokensOut === undefined) {
    return undefined;
  }

  const normalized: NonNullable<CompletionResult["usage"]> = {};

  if (tokensIn !== undefined) {
    normalized.tokens_in = tokensIn;
  }

  if (tokensOut !== undefined) {
    normalized.tokens_out = tokensOut;
  }

  return normalized;
}

function parseOpenAIToolCalls(raw: OpenAIToolCallRaw[] | undefined): NativeToolCall[] {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return [];
  const out: NativeToolCall[] = [];
  for (const tc of raw) {
    if (!tc || !tc.function?.name) continue;
    let args: Record<string, unknown> = {};
    const rawArgs = tc.function.arguments;
    if (typeof rawArgs === "string" && rawArgs.trim()) {
      try {
        const parsed = JSON.parse(rawArgs) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        /* keep empty args */
      }
    } else if (rawArgs && typeof rawArgs === "object") {
      args = rawArgs as Record<string, unknown>;
    }
    out.push({
      id: String(tc.id || `ocall_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
      name: tc.function.name,
      args,
    });
  }
  return out;
}

export async function openaiRespond(args: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  timeoutMs: number;
  tools?: NativeToolDef[];
}): Promise<CompletionWithTools> {
  if (!args.apiKey?.trim()) {
    throw new Error("OpenAI API key no configurada.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);

  try {
    const body: Record<string, unknown> = {
      model: args.model,
      messages: args.messages,
      temperature: 0.2,
    };
    if (args.tools && args.tools.length > 0) {
      body.tools = args.tools;
      body.tool_choice = "auto";
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json().catch(() => ({}))) as OpenAIResponse;

    if (!res.ok) {
      const message =
        json.error?.message?.trim() ||
        `OpenAI HTTP ${res.status}`;
      throw new Error(message);
    }

    const msg = json.choices?.[0]?.message;
    const rawContent = msg?.content;
    const text = extractTextContent(rawContent);
    const usage = normalizeUsage(json.usage);
    const toolCalls = parseOpenAIToolCalls(msg?.tool_calls);

    const result: CompletionWithTools = {
      provider: "openai",
      model: args.model,
      text,
      fallbackUsed: false,
    };

    if (usage) {
      result.usage = usage;
    }
    if (toolCalls.length > 0) {
      result.toolCalls = toolCalls;
    }

    return result;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`OpenAI timeout después de ${args.timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
