export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
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
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(text.slice(first, last + 1));
      } catch {
        return text;
      }
    }
    return text;
  }
}