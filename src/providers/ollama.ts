import type { ChatMessage, CompletionResult } from "../types.js";

export async function ollamaRespond(args: {
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
  timeoutMs: number;
}): Promise<CompletionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);

  try {
    const res = await fetch(`${args.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: args.model,
        messages: args.messages,
        stream: false
      })
    });

    const json = (await res.json()) as { message?: { content?: string }; error?: string };
    if (!res.ok) throw new Error(json.error || `Ollama HTTP ${res.status}`);

    return {
      provider: "ollama",
      model: args.model,
      text: json.message?.content?.trim() || "",
      fallbackUsed: false
    };
  } finally {
    clearTimeout(timer);
  }
}