import type { ChatMessage, CompletionResult } from "../types.js";

type OpenAIChatContentPart =
  | { type?: "text"; text?: string }
  | { type?: string; [key: string]: unknown };

type OpenAIMessage = {
  content?: string | OpenAIChatContentPart[] | null;
};

type OpenAIResponse = {
  choices?: Array<{
    message?: OpenAIMessage;
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

export async function openaiRespond(args: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  timeoutMs: number;
}): Promise<CompletionResult> {
  if (!args.apiKey?.trim()) {
    throw new Error("OpenAI API key no configurada.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: args.model,
        messages: args.messages,
        temperature: 0.2,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as OpenAIResponse;

    if (!res.ok) {
      const message =
        json.error?.message?.trim() ||
        `OpenAI HTTP ${res.status}`;
      throw new Error(message);
    }

    const rawContent = json.choices?.[0]?.message?.content;
    const text = extractTextContent(rawContent);
    const usage = normalizeUsage(json.usage);

    const result: CompletionResult = {
      provider: "openai",
      model: args.model,
      text,
      fallbackUsed: false,
    };

    if (usage) {
      result.usage = usage;
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