export const PALETTE = {
  iceBlue: "#a8dadc",
  deepWater: "#0d1b2a",
  snowWhite: "#f1faee",
  auroraGreen: "#80ffdb",
  flareRed: "#e63946",
} as const;

export function formatRaceTime(totalSeconds: number | null): string {
  if (totalSeconds === null) return "--:--.--";
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped - minutes * 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}
