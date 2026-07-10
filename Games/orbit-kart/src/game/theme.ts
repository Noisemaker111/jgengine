export const PALETTE = {
  spaceIndigo: "#1b1f4b",
  planetPeach: "#ffb377",
  planetMint: "#7fd8be",
  boostTangerine: "#ff7f11",
  starlight: "#f5f3ff",
} as const;

export function formatRaceTime(totalSeconds: number | null): string {
  if (totalSeconds === null) return "--:--.--";
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped - minutes * 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}

export function ordinal(position: number): string {
  const suffixes: Record<number, string> = { 1: "ST", 2: "ND", 3: "RD" };
  return `${position}${suffixes[position] ?? "TH"}`;
}
