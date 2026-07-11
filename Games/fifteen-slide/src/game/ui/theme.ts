import type { CSSProperties } from "react";

export const COLORS = {
  charcoal: "#14110c",
  frame: "#1c1811",
  slot: "#0e0c08",
  ivory: "#ece0c8",
  muted: "#a5906f",
  brass: "#d8b24a",
  brassBright: "#f2d886",
  brassDeep: "#8f6c25",
} as const;

export const NUMERAL_FONT = "'Georgia', 'Iowan Old Style', 'Times New Roman', serif";

export const panelClass =
  "rounded-xl border border-[#3a3024] bg-[#1e1912]/90 shadow-[0_10px_28px_rgba(0,0,0,0.5)] backdrop-blur-sm";

export const labelClass = "text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a5906f]";

export function badgeClass(active: boolean): string {
  return [
    "inline-flex min-w-[1.15rem] items-center justify-center rounded px-1 py-0.5 text-[10px] font-bold leading-none",
    active
      ? "bg-[#d8b24a] text-[#221a0e]"
      : "border border-[#5a4a2e] bg-[#0f0c08] text-[#d8b24a]",
  ].join(" ");
}

export function tileStyle(solved: boolean): CSSProperties {
  return {
    backgroundImage:
      "repeating-linear-gradient(94deg, rgba(0,0,0,0.05) 0 2px, rgba(255,235,200,0.03) 2px 6px)," +
      "linear-gradient(152deg, #90623a 0%, #6f4525 46%, #4c2f16 100%)",
    border: "1px solid #38240f",
    boxShadow: solved
      ? "inset 0 2px 3px rgba(255,225,170,0.42), inset 0 -3px 6px rgba(0,0,0,0.45), 0 0 0 2px rgba(242,216,134,0.6), 0 0 18px rgba(216,178,74,0.55)"
      : "inset 0 2px 3px rgba(255,225,170,0.38), inset 0 -3px 6px rgba(0,0,0,0.5), 0 4px 9px rgba(0,0,0,0.5)",
  };
}

export function numeralStyle(cellFraction: number): CSSProperties {
  return {
    fontFamily: NUMERAL_FONT,
    fontWeight: 800,
    color: "#e9c86a",
    fontSize: `${cellFraction * 42}cqw`,
    textShadow: "0 1px 1px rgba(0,0,0,0.7), 0 0 8px rgba(216,178,74,0.28)",
    lineHeight: 1,
  };
}

export function formatClock(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—:—";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
