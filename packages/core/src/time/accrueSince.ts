// @skill jgengine-world
export interface Accrual {
  elapsedMs: number;
  elapsedSeconds: number;
  anchorMs: number;
}

export function accrueSince(anchorMs: number, nowMs: number, options: { capMs?: number } = {}): Accrual {
  const cap = options.capMs ?? Infinity;
  if (!Number.isFinite(anchorMs) || !Number.isFinite(nowMs) || Number.isNaN(cap) || cap < 0) {
    throw new RangeError("Accrual requires finite anchors and a nonnegative cap");
  }
  const elapsedMs = Math.min(cap, Math.max(0, nowMs - anchorMs));
  return { elapsedMs, elapsedSeconds: elapsedMs / 1000, anchorMs: Math.max(anchorMs, nowMs) };
}
