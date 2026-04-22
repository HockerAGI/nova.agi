import type { JsonObject, Provider } from "../types.js";
import { sbAdmin } from "./supabase.js";

function monthStartISO(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function tokensUsedThisMonth(
  project_id: string,
  provider: Provider,
): Promise<number> {
  try {
    const sb = sbAdmin();
    const since = monthStartISO();

    const { data, error } = await sb
      .from("llm_usage")
      .select("tokens_in, tokens_out")
      .eq("project_id", project_id)
      .eq("provider", provider)
      .gte("created_at", since)
      .limit(10000);

    if (error || !data) return 0;

    let sum = 0;
    for (const row of data as Array<Record<string, unknown>>) {
      sum += Number(row.tokens_in ?? 0) + Number(row.tokens_out ?? 0);
    }

    return sum;
  } catch {
    return 0;
  }
}

export async function recordUsage(args: {
  project_id: string;
  thread_id?: string | undefined;
  provider: Provider;
  model: string;
  tokens_in?: number | undefined;
  tokens_out?: number | undefined;
  meta?: JsonObject | undefined;
  trace_id?: string | undefined;
}): Promise<void> {
  try {
    const sb = sbAdmin();

    const metaData: JsonObject = {
      ...(isRecord(args.meta) ? (args.meta as JsonObject) : {}),
      trace_id: args.trace_id ?? null,
      thread_id: args.thread_id ?? null,
    };

    await sb.from("llm_usage").insert({
      project_id: args.project_id,
      provider: args.provider,
      model: args.model,
      tokens_in: args.tokens_in ?? null,
      tokens_out: args.tokens_out ?? null,
      meta: metaData,
    });
  } catch {
    // no-op
  }
}
