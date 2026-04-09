import type { ChatMessage } from "../types.js";

type AnthropicContentBlock = {
  type?: string;
  text?: string;
};

type AnthropicResponse = {
  content?: AnthropicContentBlock[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

function splitMessages(messages: ChatMessage[]): { system: string; turns: Array<{ role: "user" | "assistant"; content: string }> } {
  const systemParts: string[] = [];
  const turns: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const message of messages) {
    if (message.role === "system") {
      if (message.content.trim()) systemParts.push(message.content.trim());
      continue;
    }

    if (message.role === "tool") continue;
    if (!message.content.trim()) continue;

    turns.push({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    });
  }

  return {
    system: systemParts.join("\n\n").trim(),
    turns,
  };
}

export async function anthropicRespond(args: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  jsonMode?: boolean;
}): Promise<{
  text: string;
  usage?: { tokens_in?: number; tokens_out?: number };
}> {
  const { system, turns } = splitMessages(args.messages);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": args.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: 4096,
      system: args.jsonMode
        ? `${system ? `${system}\n\n` : ""}Responde solo con JSON válido y sin texto adicional.`
        : system || undefined,
      messages: turns,
      temperature: args.jsonMode ? 0.2 : 0.7,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Anthropic error: ${text}`);
  }

  const payload = JSON.parse(text) as AnthropicResponse;
  const output = (payload.content ?? [])
    .map((block) => (block.type === "text" ? block.text ?? "" : ""))
    .join("")
    .trim();

  return {
    text: output,
    usage: payload.usage
      ? {
          tokens_in: payload.usage.input_tokens,
          tokens_out: payload.usage.output_tokens,
        }
      : undefined,
  };
}