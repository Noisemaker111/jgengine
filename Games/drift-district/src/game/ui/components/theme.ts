export const PALETTE = {
  asphalt: "#1a1a24",
  asphaltPanel: "#15151d",
  pink: "#ff2d78",
  cyan: "#29d9e0",
  amber: "#ffb347",
  ink: "#e8e6f0",
} as const;

export function formatRaceTime(totalSeconds: number | null): string {
  if (totalSeconds === null) return "--:--.--";
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped - minutes * 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}
