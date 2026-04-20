export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      output[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return output;
  }

  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value ?? {}));
}

export const canonicalJson = stableJson;

export function parseStableJson(input: string): unknown {
  const text = String(input ?? "").trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    // sigue abajo
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // sigue abajo
    }
  }

  return null;
}