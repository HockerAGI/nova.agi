import type { ChatMessage } from "../types.js";

export type OpenAiResult = {
  text: string;
  usage?: { tokens_in?: number; tokens_out?: number };
  raw?: unknown;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

async function getJson(res: Response): Promise<{ ok: boolean; json: unknown; text: string }> {
  const text = await res.text().catch(() => "");
  try {
    return { ok: true, json: JSON.parse(text) as unknown, text };
  } catch {
    return { ok: false, json: null, text };
  }
}

function extractResponsesText(payload: unknown): string {
  if (!isRecord(payload)) return "";

  if (isString(payload.output_text) && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = payload.output;
  if (!Array.isArray(output)) return "";

  const chunks: string[] = [];

  for (const item of output) {
    if (!isRecord(item)) continue;

    const content = item.content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      if (!isRecord(part)) continue;
      if (isString(part.text) && part.text.trim()) {
        chunks.push(part.text.trim());
      }
    }
  }

  return chunks.join("\n").trim();
}

function extractChatText(payload: unknown): string {
  if (!isRecord(payload)) return "";

  const choices = payload.choices;
  if (!Array.isArray(choices)) return "";

  const first = choices[0];
  if (!isRecord(first)) return "";

  const message = first.message;
  if (!isRecord(message)) return "";

  const content = message.content;
  if (isString(content)) return content.trim();

  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const piece of content) {
      if (isRecord(piece) && isString(piece.text) && piece.text.trim()) {
        parts.push(piece.text.trim());
      }
    }
    return parts.join("\n").trim();
  }

  return "";
}

export async function openaiRespond(args: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  jsonMode?: boolean;
  temperature?: number;
}): Promise<OpenAiResult> {
  const { apiKey, model, messages } = args;
  const jsonMode = Boolean(args.jsonMode);
  const temperature = typeof args.temperature === "number" ? args.temperature : 0.2;

  // 1) Responses API
  try {
    const body: JsonRecord = {
      model,
      input: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature,
    };

    if (jsonMode) {
      body.text = { format: { type: "json_object" } };
    }

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const parsed = await getJson(r);
    if (!r.ok) {
      const err = isRecord(parsed.json) ? parsed.json : null;
      const msg =
        (isRecord(err?.error) && isString(err.error.message) && err.error.message) ||
        parsed.text ||
        `OpenAI error (${r.status})`;
      throw new Error(msg);
    }

    const payload = parsed.json;
    const text = extractResponsesText(payload) || JSON.stringify(payload);
    const usage =
      isRecord(payload) && isRecord(payload.usage)
        ? {
            tokens_in: Number(payload.usage.input_tokens ?? 0) || undefined,
            tokens_out: Number(payload.usage.output_tokens ?? 0) || undefined,
          }
        : undefined;

    return { text, usage, raw: payload };
  } catch {
    // 2) Fallback: Chat Completions
    const body: JsonRecord = {
      model,
      messages,
      temperature,
    };

    if (jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const parsed = await getJson(r);
    if (!r.ok) {
      const err = isRecord(parsed.json) ? parsed.json : null;
      const msg =
        (isRecord(err?.error) && isString(err.error.message) && err.error.message) ||
        parsed.text ||
        `OpenAI error (${r.status})`;
      throw new Error(msg);
    }

    const payload = parsed.json;
    const text = extractChatText(payload) || JSON.stringify(payload);
    const usage =
      isRecord(payload) && isRecord(payload.usage)
        ? {
            tokens_in: Number(payload.usage.prompt_tokens ?? 0) || undefined,
            tokens_out: Number(payload.usage.completion_tokens ?? 0) || undefined,
          }
        : undefined;

    return { text, usage, raw: payload };
  }
}