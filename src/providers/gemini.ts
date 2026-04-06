import type { ChatMessage } from "../types.js";

export type GeminiResult = {
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

function extractGeminiText(payload: unknown): string {
  if (!isRecord(payload)) return "";

  const candidates = payload.candidates;
  if (!Array.isArray(candidates)) return "";

  const parts: string[] = [];

  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;

    const content = candidate.content;
    if (!isRecord(content) || !Array.isArray(content.parts)) continue;

    for (const piece of content.parts) {
      if (isRecord(piece) && isString(piece.text) && piece.text.trim()) {
        parts.push(piece.text.trim());
      }
    }
  }

  return parts.join("\n").trim();
}

export async function geminiRespond(args: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  jsonMode?: boolean;
  temperature?: number;
}): Promise<GeminiResult> {
  const jsonMode = Boolean(args.jsonMode);
  const temperature = typeof args.temperature === "number" ? args.temperature : 0.2;

  const system = args.messages.find((m) => m.role === "system")?.content || "";
  const contents = args.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    args.model,
  )}:generateContent`;

  const body: JsonRecord = {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents,
    generationConfig: {
      temperature,
      ...(jsonMode ? { responseMimeType: "application/json" } : {}),
    },
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": args.apiKey,
    },
    body: JSON.stringify(body),
  });

  const text = await r.text();
  let payload: unknown = null;

  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    payload = { raw: text };
  }

  if (!r.ok) {
    const msg =
      isRecord(payload) && isRecord(payload.error) && isString(payload.error.message)
        ? payload.error.message
        : isRecord(payload) && isString(payload.message)
          ? payload.message
          : text || `Gemini error (${r.status})`;
    throw new Error(msg);
  }

  const out = extractGeminiText(payload) || JSON.stringify(payload);
  const usage =
    isRecord(payload) && isRecord(payload.usageMetadata)
      ? {
          tokens_in: Number(payload.usageMetadata.promptTokenCount ?? 0) || undefined,
          tokens_out: Number(payload.usageMetadata.candidatesTokenCount ?? 0) || undefined,
        }
      : undefined;

  return { text: out, usage, raw: payload };
}