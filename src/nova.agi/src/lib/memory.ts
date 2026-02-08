import crypto from "crypto";
import { supabaseAdmin } from "./supabase.js";

type MemoryItem = {
  project_id: string;
  agi_id?: string | null;
  kind?: string;
  content: string;
  meta?: Record<string, any>;
};

export async function remember(item: MemoryItem) {
  const sb = supabaseAdmin();

  // HOT MODE: no escribir memoria
  const hot = await isHotMode();
  if (hot) return { skipped: true, reason: "hot_mode" };

  const payload = {
    project_id: item.project_id,
    agi_id: item.agi_id ?? null,
    kind: item.kind ?? "note",
    content: item.content,
    meta: item.meta ?? {}
  };

  // Embedding opcional (si hay GEMINI_API_KEY u OPENAI_API_KEY)
  const embedding = await tryEmbed(item.content);
  const row = embedding ? { ...payload, embedding } : payload;

  const { data, error } = await sb.from("memory_items").insert(row).select("*").single();
  if (error) throw error;
  return data;
}

export async function isHotMode(): Promise<boolean> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("system_controls")
    .select("meta")
    .eq("id", "global")
    .maybeSingle();
  if (error) return false;
  const meta = (data?.meta ?? {}) as any;
  return meta?.hot_mode === true;
}

// Embeddings:
// - Gemini: models/gemini-embedding-001:embedContent (x-goog-api-key) 5
async function tryEmbed(text: string): Promise<number[] | null> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (geminiKey) return embedGemini(text, geminiKey);
  if (openaiKey) return embedOpenAI(text, openaiKey);

  return null;
}

async function embedGemini(text: string, apiKey: string): Promise<number[] | null> {
  const model = process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ content: { parts: [{ text }] } })
  });
  if (!res.ok) return null;
  const json: any = await res.json();
  const values = json?.embedding?.values;
  return Array.isArray(values) ? values : null;
}

// OpenAI: /v1/embeddings 
async function embedOpenAI(text: string, apiKey: string): Promise<number[] | null> {
  const model = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model, input: text })
  });
  if (!res.ok) return null;
  const json: any = await res.json();
  const vec = json?.data?.[0]?.embedding;
  return Array.isArray(vec) ? vec : null;
}