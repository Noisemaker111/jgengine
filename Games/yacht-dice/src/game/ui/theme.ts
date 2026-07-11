import type { CSSProperties } from "react";

export type Run = (name: string, input?: Record<string, unknown>) => void;

export const C = {
  baize:
    "radial-gradient(ellipse 130% 100% at 50% 16%, #237f52 0%, #16643f 40%, #0c3f28 74%, #072a1c 100%)",
  felt: "#0c3a27",
  feltRaised: "linear-gradient(180deg, #14503686 0%, #0c3a27 100%)",
  leather: "#5a3a20",
  leatherLight: "#875734",
  stitch: "rgba(240,222,176,0.34)",
  ink: "#211f1b",
  gold: "#e9c46a",
  goldSoft: "#f2dd97",
  text: "#f3ecd9",
  textDim: "rgba(243,236,217,0.6)",
  ghost: "rgba(243,236,217,0.32)",
  line: "rgba(240,222,176,0.14)",
  ok: "#83dc93",
  rowBank: "rgba(233,196,106,0.12)",
} as const;

export const SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif';
export const SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const KEYFRAMES = `
@keyframes yd-tumble { 0%{transform:translateY(-46%) rotate(-150deg) scale(.6);opacity:.1} 55%{transform:translateY(6%) rotate(12deg) scale(1.08);opacity:1} 100%{transform:none;opacity:1} }
@keyframes yd-pop { 0%{transform:scale(.5);opacity:0} 60%{transform:scale(1.16)} 100%{transform:scale(1);opacity:1} }
@keyframes yd-glow { 0%,100%{box-shadow:0 6px 16px rgba(0,0,0,.4)} 50%{box-shadow:0 6px 16px rgba(0,0,0,.4),0 0 22px rgba(233,196,106,.6)} }
`;

/** A leather-trimmed felt surface. */
export function leather(padding: number, radius = 16): CSSProperties {
  return {
    background: C.feltRaised,
    border: `2px solid ${C.leatherLight}`,
    borderRadius: radius,
    boxShadow: "0 14px 34px rgba(0,0,0,.45), inset 0 1px 0 rgba(240,222,176,.1)",
    outline: `1px dashed ${C.stitch}`,
    outlineOffset: -6,
    padding,
  };
}

export function pill(active: boolean): CSSProperties {
  return {
    pointerEvents: "auto",
    cursor: "pointer",
    font: `700 11px/1 ${SANS}`,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    padding: "8px 12px",
    borderRadius: 999,
    color: active ? C.ink : C.text,
    background: active ? C.gold : "rgba(255,255,255,0.06)",
    border: `1px solid ${active ? C.gold : "rgba(240,222,176,0.28)"}`,
    whiteSpace: "nowrap",
  };
}
