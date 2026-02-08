import type { NovaDbMessage } from "../types.js";

export async function openaiChat(args: {
  apiKey: string;
  model: string;
  system: string;
  history: NovaDbMessage[];
  userMessage: string;
}): Promise<{ text: string; usage?: { input_tokens?: number; output_tokens?: number }; raw: any }> {
  if (!args.apiKey) throw new Error("OPENAI_API_KEY missing");

  const messages = [
    { role: "system", content: args.system },
    ...args.history
      .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "nova")
      .map((m) => ({
        role: m.role === "nova" ? "assistant" : m.role,
        content: m.content
      })),
    { role: "user", content: args.userMessage }
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${args.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: args.model,
      messages,
      temperature: 0.2
    })
  });

  const raw = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(raw?.error?.message ?? `OpenAI error (${res.status})`);

  const text = raw?.choices?.[0]?.message?.content ?? "";
  const usage = raw?.usage
    ? { input_tokens: raw.usage.prompt_tokens, output_tokens: raw.usage.completion_tokens }
    : undefined;

  return { text, usage, raw };
}