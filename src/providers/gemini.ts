type Msg = { role: string; content: string };

type GeminiChatArgs = {
  apiKey: string;
  model: string;
  system: string;
  messages: Msg[];
  wantJson?: boolean;
};

function mapRole(role: string) {
  // Gemini usa "user" y "model"
  return role === "assistant" ? "model" : "user";
}

export async function geminiChat(args: GeminiChatArgs): Promise<{
  assistantText: string;
  raw: any;
  usage: any;
  model?: string;
}> {
  const { apiKey, model, system, messages, wantJson } = args;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({
      role: mapRole(m.role),
      parts: [{ text: m.content }]
    })),
    generationConfig: wantJson ? { responseMimeType: "application/json", temperature: 0.2 } : { temperature: 0.2 }
  };

  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || "Gemini error";
    throw new Error(msg);
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  const assistantText = typeof text === "string" && text.trim() ? text : "No pude generar respuesta.";

  return { assistantText, raw: data, usage: data?.usageMetadata ?? null, model };
}