import { createHash } from "node:crypto";

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

type Bucket = {
  count: number;
  resetAt: number;
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

export function createRequestRateLimiter(options?: {
  windowMs?: number;
  max?: number;
  maxBuckets?: number;
}) {
  const windowMs = positiveInteger(options?.windowMs ?? 60_000, 60_000);
  const max = positiveInteger(options?.max ?? 60, 60);
  const maxBuckets = positiveInteger(options?.maxBuckets ?? 10_000, 10_000);
  const buckets = new Map<string, Bucket>();
  let operations = 0;

  const prune = (now: number) => {
    operations += 1;
    if (operations % 100 !== 0 && buckets.size < maxBuckets) return;

    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }

    if (buckets.size <= maxBuckets) return;
    const overflow = buckets.size - maxBuckets;
    for (const key of buckets.keys()) {
      buckets.delete(key);
      if (buckets.size <= maxBuckets - overflow) break;
    }
  };

  return {
    consume(request: RequestLike, now = Date.now()): RateLimitDecision {
      prune(now);
      const key = requestKey(request);
      const current = buckets.get(key);
      const bucket = !current || current.resetAt <= now
        ? { count: 0, resetAt: now + windowMs }
        : current;

      bucket.count += 1;
      buckets.set(key, bucket);

      const allowed = bucket.count <= max;
      const remaining = Math.max(0, max - bucket.count);
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

      return {
        allowed,
        limit: max,
        remaining,
        resetAt: bucket.resetAt,
        retryAfterSeconds,
      };
    },
  };
}
