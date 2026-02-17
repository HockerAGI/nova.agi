import type { ChatMessage } from "../types.js";

export type OpenAiResult = {
  text: string;
  usage?: { tokens_in?: number; tokens_out?: number };
  raw?: any;
};

function getJson(res: Response) {
  return res
    .text()
    .then((t) => {
      try {
        return { ok: true, json: JSON.parse(t), text: t };
      } catch {
        return { ok: false, json: null, text: t };
      }
    })
    .catch(() => ({ ok: false, json: null, text: "" }));
}

function extractResponsesText(payload: any): string {
  // Respuestas suelen traer output_text directo, pero también puede venir en output[].content[].text
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  const out = payload?.output;
  if (Array.isArray(out)) {
    for (const item of out) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          const t = c?.text;
          if (typeof t === "string" && t.trim()) return t;
        }
      }
    }
  }
  return "";
}

function extractChatText(payload: any): string {
  const t = payload?.choices?.[0]?.message?.content;
  return typeof t === "string" ? t : "";
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

  // 1) Responses API (preferido)
  try {
    const body: any = {
      model,
      input: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature
    };

    if (jsonMode) {
      // JSON mode en Responses API: text.format.type = "json_object".
      body.text = { format: { type: "json_object" } };
    }

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const parsed = await getJson(r);
    if (!r.ok) {
      const msg = (parsed.json as any)?.error?.message || parsed.text || `OpenAI error (${r.status})`;
      // Si la API no está disponible para esta key/model, hacemos fallback a Chat Completions.
      throw new Error(msg);
    }

    const payload = parsed.json;
    const text = extractResponsesText(payload) || JSON.stringify(payload);
    const usage = payload?.usage
      ? {
          tokens_in: Number(payload.usage?.input_tokens ?? 0) || undefined,
          tokens_out: Number(payload.usage?.output_tokens ?? 0) || undefined
        }
      : undefined;

    return { text, usage, raw: payload };
  } catch {
    // 2) Fallback: Chat Completions
    const body: any = {
      model,
      messages,
      temperature
    };

    if (jsonMode) {
      // JSON mode para Chat Completions: response_format.json_object.
      body.response_format = { type: "json_object" };
    }

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const parsed = await getJson(r);
    if (!r.ok) {
      const msg = (parsed.json as any)?.error?.message || parsed.text || `OpenAI error (${r.status})`;
      throw new Error(msg);
    }

    const payload = parsed.json;
    const text = extractChatText(payload) || JSON.stringify(payload);
    const usage = payload?.usage
      ? {
          tokens_in: Number(payload.usage?.prompt_tokens ?? 0) || undefined,
          tokens_out: Number(payload.usage?.completion_tokens ?? 0) || undefined
        }
      : undefined;

    return { text, usage, raw: payload };
  }
}