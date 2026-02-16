type Msg = { role: string; content: string };

type OpenAIChatArgs = {
  apiKey: string;
  model: string;
  system: string;
  messages: Msg[];
  wantJson?: boolean;
};

function pickTextFromResponses(data: any): string {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text;

  // fallback genérico: busca texto en output
  const out = data?.output;
  if (Array.isArray(out)) {
    for (const item of out) {
      const content = item?.content;
      if (Array.isArray(content)) {
        const t = content.find((c: any) => c?.type === "output_text" && typeof c?.text === "string")?.text;
        if (t) return t;
      }
    }
  }
  return "";
}

function pickTextFromChat(data: any): string {
  const t = data?.choices?.[0]?.message?.content;
  return typeof t === "string" ? t : "";
}

export async function openaiChat(args: OpenAIChatArgs): Promise<{
  assistantText: string;
  raw: any;
  usage: any;
  model?: string;
}> {
  const { apiKey, model, system, messages, wantJson } = args;

  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`
  };

  // 1) Intento: Responses API
  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        instructions: system,
        input: messages,
        temperature: 0.2,
        response_format: wantJson ? { type: "json_object" } : undefined
      })
    });

    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      const assistantText = pickTextFromResponses(data) || "";
      return { assistantText: assistantText || "No pude generar respuesta.", raw: data, usage: data?.usage ?? null, model };
    }
    // si falla, caemos al fallback
  } catch {
    // ignore -> fallback
  }

  // 2) Fallback: Chat Completions
  const r2 = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: wantJson ? { type: "json_object" } : undefined,
      messages: [{ role: "system", content: system }, ...messages]
    })
  });

  const data2 = await r2.json().catch(() => ({}));
  if (!r2.ok) {
    const err = data2?.error?.message || "OpenAI error";
    throw new Error(err);
  }

  const assistantText = pickTextFromChat(data2) || "No pude generar respuesta.";
  return { assistantText, raw: data2, usage: data2?.usage ?? null, model };
}