/** The host's readiness budget, shared by every page capture stage. @internal */
export function captureTimeout(params: URLSearchParams): number {
  const raw = params.get("captureTimeout");
  const timeout = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : 60_000;
}

/** A later stage spends the remaining budget instead of starting a shorter deadline. @internal */
export function captureDeadline(timeoutMs: number, now: () => number = () => performance.now(), startedAt: number = now()): () => number {
  const deadline = startedAt + timeoutMs;
  return () => Math.max(0, deadline - now());
}
