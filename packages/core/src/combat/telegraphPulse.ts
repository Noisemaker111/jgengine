/** @internal */
export function telegraphPulseOpacity(bornMs: number, windupMs: number, nowMs: number): number {
  const progress = Math.max(0, Math.min(1, (nowMs - bornMs) / Math.max(1, windupMs)));
  return 0.45 + 0.5 * progress;
}
