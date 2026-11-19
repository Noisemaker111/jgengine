export interface RateWindowPolicy { windowMs: number; max: number }
export interface RateWindowDecision { allowed: boolean; timestamps: number[]; retryAfterMs: number }

/** @capability rate-window-policy Evaluate deterministic request windows with retry timing. */
export function decideRateWindow(timestamps: readonly number[], nowMs: number, policy: RateWindowPolicy): RateWindowDecision {
  if (!Number.isFinite(nowMs) || !Number.isFinite(policy.windowMs) || policy.windowMs <= 0 ||
      !Number.isSafeInteger(policy.max) || policy.max < 1) throw new RangeError("Invalid rate window policy");
  const active = timestamps.filter((at) => Number.isFinite(at) && at > nowMs - policy.windowMs).sort((a, b) => a - b);
  if (active.length >= policy.max) {
    return { allowed: false, timestamps: active, retryAfterMs: Math.max(0, active[active.length - policy.max]! + policy.windowMs - nowMs) };
  }
  return { allowed: true, timestamps: [...active, nowMs], retryAfterMs: 0 };
}
