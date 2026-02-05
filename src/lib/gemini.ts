import { Intent } from "./intents";

type GeminiResult = {
  intent: Intent;
  reply: string;
};

function endpoint(model: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

export async function interpretWithGemini(input: {
  text: string;
  project_id: string;
  node_id: string;
}): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY ?? "";
  if (!apiKey) {
    return {
      intent: { action: "UNKNOWN", reason: "GEMINI_API_KEY missing" },
      reply: "Falta GEMINI_API_KEY en el orchestrator."
    };
  }

  const model = process.env.GEMINI_MODEL ?? "gemini-1.5-pro";

  const schema = {
    type: "object",
    properties: {
      reply: { type: "string" },
      intent: {
        type: "object",
        properties: {
          action: { type: "string" },
          params: { type: "object" }
        },
        required: ["action"]
      }
    },
    required: ["reply", "intent"]
  };

  const system = [
    "Eres NOVA (orchestrator).",
    "Devuelve SIEMPRE JSON válido que cumpla el schema.",
    "No inventes ids. Si falta un dato, pide el dato en 'reply' y usa intent UNKNOWN.",
    "Acciones válidas: PING, NODES_LIST, AGIS_LIST, SUPPLY_PRODUCTS_LIST, SUPPLY_ORDERS_LIST, DEPLOY_HOCKER_ONE, COMMAND_SEND, UNKNOWN."
  ].join("\n");

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: input.text }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: schema
    }
  };

  const r = await fetch(`${endpoint(model)}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const j = await r.json().catch(() => ({} as any));
  if (!r.ok) {
    return {
      intent: { action: "UNKNOWN", reason: `Gemini error: ${j?.error?.message ?? r.status}` },
      reply: "Gemini falló interpretando la intención. Reintenta."
    };
  }

  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) {
    return {
      intent: { action: "UNKNOWN", reason: "No text from Gemini" },
      reply: "Gemini respondió vacío. Reintenta."
    };
  }

  try {
    const parsed = JSON.parse(text);
    return {
      intent: (parsed.intent ?? { action: "UNKNOWN" }) as Intent,
      reply: String(parsed.reply ?? "")
    };
  } catch {
    return {
      intent: { action: "UNKNOWN", reason: "Invalid JSON from Gemini" },
      reply: "Gemini no devolvió JSON válido. Reintenta."
    };
  }
}