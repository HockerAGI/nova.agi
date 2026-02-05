type GeminiAction =
  | { type: "enqueue"; command: "status" | "ping" | "read_dir" | "read_file_head"; payload?: any }
  | { type: "vercel.redeploy" }
  | { type: "unknown" };

export type GeminiResult = {
  reply: string;
  action: GeminiAction;
};

const NOVA_SYSTEM = `Eres NOVA, orquestadora del ecosistema HOCKER.
Reglas:
- Responde SIEMPRE en JSON válido.
- Nunca propongas ejecutar acciones fuera del allowlist.
- Si la intención no es clara, action.type="unknown".
`;

export async function interpretWithGemini(args: {
  apiKey: string;
  model: string;
  text: string;
}): Promise<GeminiResult | null> {
  const { apiKey, model, text } = args;
  if (!apiKey) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const schema = {
    type: "OBJECT",
    properties: {
      reply: { type: "STRING" },
      action: {
        type: "OBJECT",
        properties: {
          type: { type: "STRING" },
          command: { type: "STRING" },
          payload: { type: "OBJECT" }
        },
        required: ["type"]
      }
    },
    required: ["reply", "action"]
  };

  const body = {
    systemInstruction: { parts: [{ text: NOVA_SYSTEM }] },
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: schema
    }
  };

  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!r.ok) return null;

  const j = await r.json().catch(() => null);
  const raw = j?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw || typeof raw !== "string") return null;

  try {
    const out = JSON.parse(raw);
    if (!out?.reply || !out?.action?.type) return null;
    return out as GeminiResult;
  } catch {
    return null;
  }
}