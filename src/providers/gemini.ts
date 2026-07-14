import type { ChatMessage, CompletionResult } from "../types.js";

/**
 * Native tool/function definition in OpenAI-compatible shape.
 * Kept provider-agnostic so handleChat can pass the same array to any provider.
 */
export type NativeToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

/**
 * A parsed native tool call returned by the model.
 */
export type NativeToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

/**
 * Extended completion result that may carry native tool calls.
 */
export type CompletionWithTools = CompletionResult & {
  toolCalls?: NativeToolCall[];
};

type GeminiPart = {
  text?: string;
  functionCall?: { name?: string; args?: Record<string, unknown> };
};

type GeminiCandidate = {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
  error?: { message?: string };
};

/** Map our ChatMessage[] to Gemini "contents" (user/model roles only). */
function toGeminiContents(messages: ChatMessage[]): Array<{ role: string; parts: GeminiPart[] }> {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

/** Convert OpenAI-style tool defs to Gemini functionDeclarations. */
function toGeminiTools(
  tools: NativeToolDef[] | undefined,
): Array<{ name: string; description: string; parameters: Record<string, unknown> }> | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
  }));
}

export async function geminiRespond(args: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  timeoutMs: number;
  tools?: NativeToolDef[];
}): Promise<CompletionWithTools> {
  if (!args.apiKey?.trim()) throw new Error("Gemini API key is empty or missing");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);

  try {
    const body: Record<string, unknown> = {
      contents: toGeminiContents(args.messages),
      generationConfig: { temperature: 0.2 },
    };

    const fnDecls = toGeminiTools(args.tools);
    if (fnDecls && fnDecls.length > 0) {
      body.tools = [{ functionDeclarations: fnDecls }];
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent?key=${encodeURIComponent(args.apiKey)}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    const json = (await res.json().catch(() => ({}))) as GeminiResponse;

    if (!res.ok) throw new Error(json.error?.message || `Gemini HTTP ${res.status}`);

    const candidate = json.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];

    const textParts: string[] = [];
    const toolCalls: NativeToolCall[] = [];

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;
      if (typeof part.text === "string" && part.text) {
        textParts.push(part.text);
      }
      if (part.functionCall && part.functionCall.name) {
        toolCalls.push({
          id: `gcall_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`,
          name: part.functionCall.name,
          args: (part.functionCall.args && typeof part.functionCall.args === "object"
            ? part.functionCall.args
            : {}) as Record<string, unknown>,
        });
      }
    }

    const text = textParts.join("").trim();
    const result: CompletionWithTools = {
      provider: "gemini",
      model: args.model,
      text,
      fallbackUsed: false,
    };
    if (toolCalls.length > 0) result.toolCalls = toolCalls;
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Gemini timeout después de ${args.timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
