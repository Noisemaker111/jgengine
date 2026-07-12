export const CANOPY_PALETTE = {
  background: "#010409",
  base: "#0b1220",
  empty: "#161b22",
  levels: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
  ink: "#e6edf3",
  accent: "#39d353",
} as const;

export function levelColor(level: number): string {
  const clamped = Math.max(0, Math.min(CANOPY_PALETTE.levels.length - 1, level));
  return CANOPY_PALETTE.levels[clamped]!;
}

const HEIGHT_FLOOR = 0.1;
const HEIGHT_STEP = 0.13;
const HEIGHT_KNEE = 15;
const HEIGHT_SOFT = 0.37;

export function heightForCount(count: number): number {
  const c = Math.max(0, count);
  if (c <= HEIGHT_KNEE) return HEIGHT_FLOOR + c * HEIGHT_STEP;
  return HEIGHT_FLOOR + HEIGHT_KNEE * HEIGHT_STEP + Math.log1p(c - HEIGHT_KNEE) * HEIGHT_SOFT;
}
