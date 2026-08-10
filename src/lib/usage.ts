import type { JsonObject, Provider } from "../types.js";
import { sbAdmin } from "./supabase.js";

export type UsagePersistenceResult = {
  persisted: boolean;
  id: string | null;
  error: string | null;
};

export function requirePersistedUsage(
  result: UsagePersistenceResult,
  details: {
    provider: Provider;
    model: string;
    tokens_in?: number | undefined;
    tokens_out?: number | undefined;
  },
): JsonObject {
  if (!result.persisted || !result.id) {
    throw new Error(
      `AGI_WORKER_USAGE_PERSIST_FAILED: ${result.error ?? "usage evidence unavailable"}`,
    );
  }

  return {
    type: "usage_persistence",
    usage_id: result.id,
    provider: details.provider,
    model: details.model,
    tokens_in: details.tokens_in ?? null,
    tokens_out: details.tokens_out ?? null,
  };
}

type UsagePersistenceClient = {
  from(table: string): {
    insert(values: Record<string, unknown>): {
      select(columns: string): {
        single(): PromiseLike<{
          data: { id?: unknown } | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
};

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

type RecordUsageArgs = {
  project_id: string;
  thread_id?: string | null | undefined;
  provider: Provider;
  model: string;
  tokens_in?: number | undefined;
  tokens_out?: number | undefined;
  meta?: JsonObject | undefined;
  trace_id?: string | undefined;
};

export async function recordUsageWithClient(
  sb: UsagePersistenceClient,
  args: RecordUsageArgs,
): Promise<UsagePersistenceResult> {
  try {
    const metaData: JsonObject = {
      ...(isRecord(args.meta) ? (args.meta as JsonObject) : {}),
      trace_id: args.trace_id ?? null,
      thread_id: args.thread_id ?? null,
    };

    const { data, error } = await sb
      .from("llm_usage")
      .insert({
        project_id: args.project_id,
        thread_id: args.thread_id ?? null,
        provider: args.provider,
        model: args.model,
        tokens_in: args.tokens_in ?? null,
        tokens_out: args.tokens_out ?? null,
        meta: metaData,
      })
      .select("id")
      .single();

    const id = String(data?.id ?? "").trim();
    if (error || !id) {
      return {
        persisted: false,
        id: null,
        error: String(error?.message ?? "LLM_USAGE_ID_MISSING").slice(0, 500),
      };
    }

    return { persisted: true, id, error: null };
  } catch (error) {
    return {
      persisted: false,
      id: null,
      error: String(error instanceof Error ? error.message : "LLM_USAGE_PERSISTENCE_FAILED").slice(
        0,
        500,
      ),
    };
  }
}

export async function recordUsage(args: RecordUsageArgs): Promise<UsagePersistenceResult> {
  return recordUsageWithClient(
    sbAdmin() as unknown as UsagePersistenceClient,
    args,
  );
}
