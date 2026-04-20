type JsonSchema = {
  type: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  propertyOrdering?: string[];
  items?: JsonSchema;
  enum?: string[];
  description?: string;
};

function stripMarkdownJsonFences(text: string): string {
  const trimmed = text.trim();

  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  return trimmed;
}

export async function geminiStructured<T>(args: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  schema: JsonSchema;
  timeoutMs?: number;
}): Promise<T> {
  const { apiKey, model, system, user, schema, timeoutMs = 20_000 } = args;

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = {
      systemInstruction: {
        parts: [{ text: system }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: user }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseJsonSchema: schema,
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const json: Record<string, unknown> = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(`Gemini error (${response.status}): ${JSON.stringify(json).slice(0, 1500)}`);
    }

    const candidates = Array.isArray(json.candidates) ? json.candidates : [];
    const firstCandidate = candidates[0] as Record<string, unknown> | undefined;
    const content = firstCandidate?.content as Record<string, unknown> | undefined;
    const parts = Array.isArray(content?.parts) ? content?.parts : [];
    const firstPart = parts[0] as Record<string, unknown> | undefined;
    const text = typeof firstPart?.text === "string" ? firstPart.text : "";

    if (!text.trim()) {
      throw new Error("Gemini: respuesta vacía.");
    }

    const clean = stripMarkdownJsonFences(text);

    try {
      return JSON.parse(clean) as T;
    } catch {
      throw new Error("Gemini: no devolvió JSON válido.");
    }
  } finally {
    clearTimeout(timeout);
  }
}