import type { ChatMessage, CompletionResult, Provider } from "../types.js";

export async function openaiRespond(args: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  timeoutMs: number;
}): Promise<CompletionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: args.model,
        messages: args.messages,
        temperature: 0.2
      })
    });

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };

    if (!res.ok) {
      throw new Error(json.error?.message || `OpenAI HTTP ${res.status}`);
    }

    const text = json.choices?.[0]?.message?.content?.trim() || "";
    return {
      provider: "openai",
      model: args.model,
      text,
      usage: {
        tokens_in: json.usage?.prompt_tokens,
        tokens_out: json.usage?.completion_tokens
      },
      fallbackUsed: false
    };
  } finally {
    clearTimeout(timer);
  }
}