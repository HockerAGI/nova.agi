import type { ChatMessage, CompletionResult } from "../types.js";

export async function anthropicRespond(args: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  timeoutMs: number;
}): Promise<CompletionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);

  try {
    const system = args.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const userMessages = args.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content
      }));

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-api-key": args.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: args.model,
        max_tokens: 2048,
        system,
        messages: userMessages
      })
    });

    const json = (await res.json()) as {
      content?: Array<{ text?: string }>;
      error?: { message?: string };
    };

    if (!res.ok) throw new Error(json.error?.message || `Anthropic HTTP ${res.status}`);

    const text = json.content?.map((p) => p.text ?? "").join("").trim() || "";
    return { provider: "anthropic", model: args.model, text, fallbackUsed: false };
  } finally {
    clearTimeout(timer);
  }
}