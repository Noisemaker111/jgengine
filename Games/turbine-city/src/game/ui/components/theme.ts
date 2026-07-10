export const PALETTE = {
  cloudWhite: "#f4f7f9",
  skyTeal: "#4ecdc4",
  citySlate: "#5d737e",
  windsockOrange: "#ff9f1c",
  shadowBlue: "#2b3a67",
} as const;

export function formatRaceTime(totalSeconds: number | null): string {
  if (totalSeconds === null) return "--:--.--";
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped - minutes * 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}

export function formatDelta(seconds: number | null): string {
  if (seconds === null) return "— —";
  const sign = seconds > 0 ? "+" : seconds < 0 ? "-" : "";
  return `${sign}${Math.abs(seconds).toFixed(2)}s`;
}
