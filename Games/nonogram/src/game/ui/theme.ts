import type { CSSProperties } from "react";

export const DESK = "#12161d";
export const INK = "#334155";
export const INK_SOFT = "#64748b";
export const INK_DIM = "#b3bdca";
export const PAPER = "#f6f1e3";
export const PAPER_EDGE = "#ece3cc";
export const LINE = "#d8ccb0";
export const LINE_HEAVY = "#b3a37c";
export const TEAL = "#0f766e";
export const TEAL_HI = "#14b8a6";
export const CROSS = "#7c8798";
export const GOOD = "#22c55e";
export const WARN = "#f43f5e";

export const deskBackground =
  "radial-gradient(circle at 30% 20%, #1b2430 0, #12161d 60%), " +
  "repeating-linear-gradient(0deg, rgba(255,255,255,0.028) 0 1px, transparent 1px 30px), " +
  "repeating-linear-gradient(90deg, rgba(255,255,255,0.028) 0 1px, transparent 1px 30px)";

export function cellSizeCss(size: number): string {
  if (size <= 5) return "min(58px, 12.5vmin)";
  if (size <= 10) return "min(35px, 7.2vmin)";
  return "min(26px, 5.2vmin)";
}

export function clueFontCss(size: number): string {
  if (size <= 5) return "min(23px, 5vmin)";
  if (size <= 10) return "min(15px, 3.1vmin)";
  return "min(12px, 2.4vmin)";
}

export const panelSurface: CSSProperties = {
  background: "rgba(15, 20, 28, 0.82)",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 14,
  backdropFilter: "blur(6px)",
  color: "#e6ecf3",
  boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
};
