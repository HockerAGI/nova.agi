import type { ChatMessage } from "../types.js";

type OllamaResponse = {
  message?: {
    content?: string;
  };
};

export async function ollamaRespond(args: {
  baseUrl?: string;
  model: string;
  messages: ChatMessage[];
}): Promise<{ text: string }> {
  const baseUrl = (args.baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/+$/, "");

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error: ${text}`);
  }

  const data = (await res.json()) as OllamaResponse;

  return {
    text: data.message?.content || "",
  };
}