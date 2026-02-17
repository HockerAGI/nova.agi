import type { ChatMessage } from "../types.js";

export type GeminiResult = {
  text: string;
  usage?: { tokens_in?: number; tokens_out?: number };
  raw?: any;
};

function extractGeminiText(payload: any): string {
  const t = payload?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join("\n");
  return typeof t === "string" ? t : "";
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
      parts: [{ text: m.content }]
    }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent`;

  const body: any = {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents,
    generationConfig: {
      temperature,
      ...(jsonMode ? { responseMimeType: "application/json" } : {})
    }
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": args.apiKey
    },
    body: JSON.stringify(body)
  });

  const text = await r.text();
  let payload: any = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }

  if (!r.ok) {
    const msg = payload?.error?.message || payload?.message || text || `Gemini error (${r.status})`;
    throw new Error(msg);
  }

  const out = extractGeminiText(payload) || JSON.stringify(payload);
  const usage = payload?.usageMetadata
    ? {
        tokens_in: Number(payload.usageMetadata?.promptTokenCount ?? 0) || undefined,
        tokens_out: Number(payload.usageMetadata?.candidatesTokenCount ?? 0) || undefined
      }
    : undefined;

  return { text: out, usage, raw: payload };
}