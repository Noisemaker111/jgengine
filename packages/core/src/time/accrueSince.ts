/** Elapsed duration and the next anchor to persist with accrued effects. */
export interface Accrual {
  elapsedMs: number;
  elapsedSeconds: number;
  anchorMs: number;
}

/** Elapsed time since a persisted anchor, capped once; persist anchorMs with the accrued result. */
export function accrueSince(anchorMs: number, nowMs: number, options: { capMs?: number } = {}): Accrual {
  const cap = options.capMs ?? Infinity;
  if (!Number.isFinite(anchorMs) || !Number.isFinite(nowMs) || Number.isNaN(cap) || cap < 0) {
    throw new RangeError("Accrual requires finite anchors and a nonnegative cap");
  }
  const elapsedMs = Math.min(cap, Math.max(0, nowMs - anchorMs));
  return { elapsedMs, elapsedSeconds: elapsedMs / 1000, anchorMs: Math.max(anchorMs, nowMs) };
}
