/**
 * Bounded worker liveness evidence. A successful tick from an old process or
 * earlier deployment does not make the current runtime ready.
 *
 * Pure function so fail-closed behavior can be tested without credentials.
 */
export function hasFreshSuccessfulWorkerTick(
  lastSuccessfulTickAt: string | null,
  intervalMs: number,
  now = Date.now(),
): boolean {
  if (!lastSuccessfulTickAt || !Number.isFinite(intervalMs) || intervalMs < 1) return false;
  const timestamp = Date.parse(lastSuccessfulTickAt);
  if (!Number.isFinite(timestamp) || timestamp > now) return false;
  const allowedAgeMs = Math.max(30_000, Math.min(intervalMs * 3, 15 * 60_000));
  return now - timestamp <= allowedAgeMs;
}
