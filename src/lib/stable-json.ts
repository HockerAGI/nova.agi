export function stableStringify(value: any): string {
  if (value === null || value === undefined) return "null";
  const t = typeof value;

  if (t === "number" || t === "boolean") return String(value);
  if (t === "string") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }

  if (t === "object") {
    const keys = Object.keys(value).sort();
    const items = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`);
    return `{${items.join(",")}}`;
  }

  return "null";
}

export function extractJsonLoose(txt: string): string | null {
  const fenced = txt.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = txt.indexOf("{");
  const end = txt.lastIndexOf("}");
  if (start >= 0 && end > start) return txt.slice(start, end + 1).trim();

  return null;
}

export function safeJsonParse<T = any>(txt: string): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(txt) };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "JSON parse error" };
  }
}