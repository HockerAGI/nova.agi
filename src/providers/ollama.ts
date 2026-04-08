import type { ChatMessage } from "../types.js";

type OllamaResponse = {
  message?: {
    content?: string;
  };
};

export async function ollamaRespond(args: {
  model: string;
  messages: ChatMessage[];
}): Promise<{ text: string }> {
  const res = await fetch("http://127.0.0.1:11434/api/chat", {
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