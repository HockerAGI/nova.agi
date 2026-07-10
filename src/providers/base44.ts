import type { ChatMessage, CompletionResult } from "../types.js";

/**
 * Base44 Superagent Provider
 *
 * Base44 manages its own model selection, so the `model` parameter
 * is accepted but ignored. The provider sends the last user message
 * to the Base44 chat endpoint and returns the agent's reply.
 */

const BASE44_AGENT_ID = "6a4f99ef6bcfc928a9eba61c";
const BASE44_API_URL = `https://api.base44.com/api/apps/${BASE44_AGENT_ID}/chat/messages`;

type Base44ChatResponse = {
  reply?: string;
  session_id?: string;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

/**
 * Extract the last user message from the conversation array.
 * Base44's chat API accepts a single message per request.
 */
function extractLastUserMessage(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === "user") {
      return message.content;
    }
  }

  // Fallback: use the last message regardless of role
  const last = messages.at(-1);
  return last?.content ?? "";
}

export async function base44Respond(args: {
  apiKey: string;
  model: string; // ignored — Base44 manages model selection
  messages: ChatMessage[];
  timeoutMs: number;
}): Promise<CompletionResult> {
  if (!args.apiKey?.trim()) {
    throw new Error("Base44 API key no configurada.");
  }

  const userMessage = extractLastUserMessage(args.messages);
  if (!userMessage.trim()) {
    throw new Error("Base44: no se encontró mensaje de usuario para enviar.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);

  try {
    const res = await fetch(BASE44_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: userMessage,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as Base44ChatResponse;

    if (!res.ok) {
      const message =
        json.error?.message?.trim() ||
        `Base44 HTTP ${res.status}`;
      throw new Error(message);
    }

    const text = String(json.reply ?? "").trim();

    return {
      provider: "base44",
      model: args.model,
      text,
      fallbackUsed: false,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Base44 timeout después de ${args.timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
