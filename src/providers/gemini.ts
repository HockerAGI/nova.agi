import type { ChatMessage, CompletionResult } from "../types.js";

export async function geminiRespond(args: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  timeoutMs: number;
}): Promise<CompletionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);

  try {
    const contents = args.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent?key=${encodeURIComponent(args.apiKey)}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents })
      }
    );

    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };

    if (!res.ok) throw new Error(json.error?.message || `Gemini HTTP ${res.status}`);

    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() || "";
    return { provider: "gemini", model: args.model, text, fallbackUsed: false };
  } finally {
    clearTimeout(timer);
  }
}