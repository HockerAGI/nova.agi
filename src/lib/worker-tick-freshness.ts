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

/**
 * Provider fallback can legitimately run several 40–60 second attempts.
 * Keep readiness true for a bounded in-flight task ONLY if this process
 * already completed at least one successful worker tick.
 * No timestamp from the database or a prior process is used here.
 */
export function hasBoundedInFlightWorkerTick(
  running: boolean,
  startedAt: string | null,
  previousSuccessAt: string | null,
  now = Date.now(),
): boolean {
  if (!running || !startedAt || !previousSuccessAt) return false;
  const started = Date.parse(startedAt);
  const previous = Date.parse(previousSuccessAt);
  const maxRunMs = 7 * 60_000;
  if (!Number.isFinite(started) || !Number.isFinite(previous) ||
      started > now || previous > started || now - previous > maxRunMs ||
      now - started > maxRunMs) return false;
  return true;
}
