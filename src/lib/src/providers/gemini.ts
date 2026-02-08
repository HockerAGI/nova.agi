import type { NovaDbMessage } from "../types.js";

export async function geminiChat(args: {
  apiKey: string;
  model: string;
  system: string;
  history: NovaDbMessage[];
  userMessage: string;
}): Promise<{ text: string; raw: any }> {
  if (!args.apiKey) throw new Error("GEMINI_API_KEY missing");

  const history = args.history
    .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "nova")
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  const prompt = [
    `SYSTEM:\n${args.system}`,
    history ? `\nHISTORY:\n${history}` : "",
    `\nUSER:\n${args.userMessage}`
  ].join("\n");

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent` +
    `?key=${encodeURIComponent(args.apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 }
    })
  });

  const raw = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(raw?.error?.message ?? `Gemini error (${res.status})`);

  const text =
    raw?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";

  return { text, raw };
}