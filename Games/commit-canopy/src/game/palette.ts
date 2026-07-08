export const CANOPY_PALETTE = {
  background: "#0d1117",
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

export function heightForCount(count: number): number {
  return 0.1 + Math.min(count, 15) * 0.13;
}
