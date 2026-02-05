type JsonSchema = {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
  propertyOrdering?: string[];
};

export async function geminiStructured<T>(args: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  schema: JsonSchema;
}): Promise<T> {
  const { apiKey, model, system, user, schema } = args;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseJsonSchema: schema
    }
  };

  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Gemini error (${r.status}): ${JSON.stringify(j).slice(0, 1200)}`);

  const txt = j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!txt) throw new Error("Gemini: respuesta vacía");

  try {
    return JSON.parse(txt) as T;
  } catch {
    throw new Error("Gemini: no devolvió JSON válido");
  }
}