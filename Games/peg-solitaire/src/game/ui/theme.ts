import type { CSSProperties } from "react";

export const COLORS = {
  backdrop: "#120f0a",
  walnutHi: "#7a4e2c",
  walnutMid: "#4c2d18",
  walnutLow: "#291709",
  frame: "#38220f",
  brass: "#c69a46",
  brassBright: "#efd489",
  brassDeep: "#7c5a1f",
  ivory: "#efe6d2",
  ivoryHi: "#fdf8ec",
  ivoryShade: "#c3b490",
  hole: "#160e07",
  panelBorder: "#4a3620",
  ink: "#efe6d2",
  muted: "#b39a76",
} as const;

export const SERIF = "'Iowan Old Style', 'Palatino Linotype', 'Georgia', serif";

export const panelClass =
  "rounded-xl border border-[#4a3620] bg-[#201810]/90 shadow-[0_10px_28px_rgba(0,0,0,0.55)] backdrop-blur-sm";

export const labelClass = "text-[10px] font-semibold uppercase tracking-[0.18em] text-[#b39a76]";

export function badgeClass(active: boolean): string {
  return [
    "inline-flex min-w-[1.15rem] items-center justify-center rounded px-1 py-0.5 text-[10px] font-bold leading-none",
    active ? "bg-[#efd489] text-[#241704]" : "border border-[#6a4f2c] bg-[#0f0a06] text-[#efd489]",
  ].join(" ");
}

/** The turned-walnut board slab with a soft inner vignette. */
export function boardStyle(): CSSProperties {
  return {
    width: "min(92vw, 70vh, 560px)",
    aspectRatio: "1 / 1",
    borderRadius: "24px",
    background:
      "radial-gradient(120% 120% at 50% 12%, rgba(255,214,150,0.14), rgba(0,0,0,0) 46%)," +
      "repeating-radial-gradient(closest-side at 50% 50%, rgba(255,225,180,0.035) 0 6px, rgba(0,0,0,0.05) 6px 13px)," +
      "linear-gradient(158deg, #7a4e2c 0%, #4c2d18 48%, #291709 100%)",
    border: "1px solid #38220f",
    boxShadow:
      "inset 0 3px 10px rgba(255,224,180,0.16), inset 0 -12px 34px rgba(0,0,0,0.62), 0 26px 60px rgba(0,0,0,0.6)",
  };
}

/** A brass-rimmed hole sunk into the board. */
export function holeStyle(): CSSProperties {
  return {
    borderRadius: "9999px",
    background: "radial-gradient(circle at 50% 38%, #221610 0%, #160e07 62%, #0b0603 100%)",
    boxShadow:
      "inset 0 3px 5px rgba(0,0,0,0.85), inset 0 -1px 2px rgba(255,220,170,0.12), 0 0 0 2px rgba(124,90,31,0.55), 0 1px 0 rgba(239,212,137,0.22)",
  };
}

/** An ivory peg; brighter/lifted when selected or a legal mover. */
export function pegStyle(selected: boolean, movable: boolean): CSSProperties {
  return {
    borderRadius: "9999px",
    background:
      "radial-gradient(circle at 38% 30%, #fdf8ec 0%, #efe6d2 42%, #c3b490 78%, #9c8a63 100%)",
    boxShadow: selected
      ? "inset 0 2px 3px rgba(255,255,255,0.7), inset 0 -4px 7px rgba(120,96,54,0.55), 0 0 0 3px rgba(239,212,137,0.85), 0 0 20px rgba(239,212,137,0.6), 0 6px 12px rgba(0,0,0,0.5)"
      : movable
        ? "inset 0 2px 3px rgba(255,255,255,0.65), inset 0 -4px 7px rgba(120,96,54,0.5), 0 0 0 1px rgba(239,212,137,0.35), 0 5px 11px rgba(0,0,0,0.5)"
        : "inset 0 2px 3px rgba(255,255,255,0.6), inset 0 -4px 7px rgba(120,96,54,0.5), 0 5px 11px rgba(0,0,0,0.5)",
  };
}

/** The glowing target ring drawn on a legal landing hole. */
export function landingStyle(): CSSProperties {
  return {
    borderRadius: "9999px",
    border: "2px solid rgba(239,212,137,0.9)",
    background: "radial-gradient(circle, rgba(239,212,137,0.32) 0%, rgba(239,212,137,0) 68%)",
    boxShadow: "0 0 16px rgba(239,212,137,0.55)",
    animation: "peg-landing 1200ms ease-in-out infinite",
  };
}

export function hintRingStyle(): CSSProperties {
  return {
    borderRadius: "9999px",
    border: "2px dashed rgba(120,200,255,0.85)",
    boxShadow: "0 0 16px rgba(120,200,255,0.45)",
    animation: "peg-landing 900ms ease-in-out infinite",
  };
}

export const KEYFRAMES = `
@keyframes peg-hop {
  0% { transform: translateY(0) scale(1); }
  42% { transform: translateY(-30%) scale(1.06); }
  100% { transform: translateY(0) scale(1); }
}
@keyframes peg-pop {
  0% { transform: scale(1) translateY(0); opacity: 1; }
  38% { transform: scale(1.3) translateY(-16%); opacity: 1; }
  100% { transform: scale(0.15) translateY(-46%); opacity: 0; }
}
@keyframes peg-landing {
  0%, 100% { opacity: 0.55; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.05); }
}
@keyframes peg-nudge {
  0%, 100% { transform: translateX(0); }
  22% { transform: translateX(-14%); }
  44% { transform: translateX(11%); }
  66% { transform: translateX(-7%); }
  84% { transform: translateX(4%); }
}
`;
