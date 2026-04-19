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

export async function tokensUsedThisMonth(project_id: string, provider: Provider): Promise<number> {
  try {
    const { data, error } = await sbAdmin()
      .from("llm_usage")
      .select("tokens_in,tokens_out")
      .eq("project_id", project_id)
      .eq("provider", provider)
      .gte("created_at", monthStartISO())
      .limit(10000);

    if (error || !data) return 0;

    return (data as Array<Record<string, unknown>>).reduce((sum, row) => {
      return sum + Number(row.tokens_in ?? 0) + Number(row.tokens_out ?? 0);
    }, 0);
  } catch {
    return 0;
  }
}

export async function recordUsage(args: {
  project_id: string;
  thread_id?: string;
  provider: Provider;
  model: string;
  tokens_in?: number;
  tokens_out?: number;
  meta?: JsonObject;
  trace_id?: string;
}): Promise<void> {
  try {
    const metaData: JsonObject = {
      ...(isRecord(args.meta) ? (args.meta as JsonObject) : {}),
      trace_id: args.trace_id ?? null,
    };

    await sbAdmin().from("llm_usage").insert({
      project_id: args.project_id,
      thread_id: args.thread_id ?? null,
      provider: args.provider,
      model: args.model,
      tokens_in: args.tokens_in ?? null,
      tokens_out: args.tokens_out ?? null,
      meta: metaData,
    });
  } catch {
    // observabilidad no bloqueante
  }
}