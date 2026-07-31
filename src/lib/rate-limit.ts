import { createHash } from "node:crypto";
import { sbAdmin } from "./supabase.js";

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

type RequestLike = {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
};

type RateLimitRpcResponse = {
  data: unknown;
  error: { message?: string } | null;
};

type RateLimitRpcClient = {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<RateLimitRpcResponse>;
};

function positiveInteger(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function requestKey(request: RequestLike) {
  const authorization = firstHeader(request.headers.authorization).trim();
  const forwarded = firstHeader(request.headers["x-forwarded-for"])
    .split(",")[0]
    ?.trim();
  const client = authorization || forwarded || request.ip || "unknown";
  return createHash("sha256").update(client).digest("hex");
}

function numericField(
  source: Record<string, unknown>,
  field: string,
  fallback: number,
) {
  const value = Number(source[field]);
  return Number.isFinite(value) ? value : fallback;
}

function parseDecision(data: unknown, max: number, now: number): RateLimitDecision {
  const candidate = Array.isArray(data) ? data[0] : data;
  if (!candidate || typeof candidate !== "object") {
    throw new Error("RATE_LIMIT_INVALID_RESPONSE");
  }

  const row = candidate as Record<string, unknown>;
  const allowed = row.allowed;
  if (typeof allowed !== "boolean") {
    throw new Error("RATE_LIMIT_INVALID_RESPONSE");
  }

  const limit = Math.max(1, Math.floor(numericField(row, "limit", max)));
  const remaining = Math.max(0, Math.floor(numericField(row, "remaining", 0)));
  const resetAt = Math.max(now, Math.floor(numericField(row, "reset_at_ms", now)));
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil(numericField(row, "retry_after_seconds", (resetAt - now) / 1000)),
  );

  return {
    allowed,
    limit,
    remaining,
    resetAt,
    retryAfterSeconds,
  };
}

export function createRequestRateLimiter(options?: {
  windowMs?: number;
  max?: number;
}) {
  const windowMs = positiveInteger(options?.windowMs ?? 60_000, 60_000);
  const max = positiveInteger(options?.max ?? 60, 60);
  const rpcClient = sbAdmin() as unknown as RateLimitRpcClient;

  return {
    async consume(request: RequestLike, now = Date.now()): Promise<RateLimitDecision> {
      const { data, error } = await rpcClient.rpc("consume_nova_rate_limit", {
        p_key: requestKey(request),
        p_window_ms: windowMs,
        p_max: max,
        p_now: new Date(now).toISOString(),
      });

      if (error) {
        throw new Error("RATE_LIMIT_UNAVAILABLE");
      }

      return parseDecision(data, max, now);
    },
  };
}
