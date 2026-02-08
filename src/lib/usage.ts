import { sbAdmin } from "./supabase.js";
import type { Provider } from "../types.js";

function monthKey(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function estimateTokensFromChars(chars: number) {
  // conservador: ~4 chars/token
  return Math.max(1, Math.ceil(chars / 4));
}

export async function tokensUsedThisMonth(project_id: string, provider: Provider): Promise<number> {
  const sb = sbAdmin();
  const mk = monthKey();

  // llm_usage: tokens_in/tokens_out
  const { data, error } = await sb
    .from("llm_usage")
    .select("tokens_in,tokens_out,created_at")
    .eq("project_id", project_id)
    .eq("provider", provider)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error || !data) return 0;

  let sum = 0;
  for (const row of data as any[]) {
    const created = String(row.created_at ?? "");
    if (!created.startsWith(mk)) continue;
    sum += Number(row.tokens_in ?? 0) + Number(row.tokens_out ?? 0);
  }
  return sum;
}