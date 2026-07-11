import type { CSSProperties } from "react";

export const COLORS = {
  charcoal: "#14110c",
  ivory: "#ece0c8",
  muted: "#a5906f",
  amber: "#ffb838",
  amberDeep: "#e07d12",
  steel: "#3a4046",
} as const;

export const consoleBackdropStyle: CSSProperties = {
  background: "radial-gradient(125% 95% at 50% -5%, #241d14 0%, #17130d 46%, #0b0906 100%)",
};

export const consolePanelStyle: CSSProperties = {
  background:
    "repeating-linear-gradient(126deg, rgba(255,255,255,0.02) 0 3px, rgba(0,0,0,0.05) 3px 7px)," +
    "linear-gradient(160deg, #241d15 0%, #191309 62%, #120d07 100%)",
  border: "1px solid #3a3024",
  boxShadow: "inset 0 1px 1px rgba(255,235,190,0.08), 0 22px 48px rgba(0,0,0,0.6)",
};

export const steelFrameStyle: CSSProperties = {
  background:
    "repeating-linear-gradient(122deg, rgba(255,255,255,0.05) 0 2px, rgba(0,0,0,0.07) 2px 5px)," +
    "linear-gradient(150deg, #545b62 0%, #2c3137 42%, #191c20 100%)",
  border: "1px solid #05070a",
  boxShadow:
    "inset 0 1px 1px rgba(255,255,255,0.28), inset 0 -6px 14px rgba(0,0,0,0.6), 0 18px 40px rgba(0,0,0,0.6)",
};

export function cellStyle(lit: boolean, isHint: boolean): CSSProperties {
  const glow = lit
    ? "0 0 16px 3px rgba(255,150,25,0.72), 0 0 36px 9px rgba(255,128,18,0.3), inset 0 0 13px rgba(255,226,160,0.78), inset 0 -3px 7px rgba(120,50,0,0.5)"
    : "inset 0 3px 8px rgba(0,0,0,0.85), inset 0 -1px 2px rgba(255,255,255,0.03), 0 1px 1px rgba(255,255,255,0.03)";
  return {
    aspectRatio: "1 / 1",
    borderRadius: "16%",
    border: "1px solid rgba(0,0,0,0.5)",
    transition: "background 220ms ease, box-shadow 260ms ease, transform 90ms ease",
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
    background: lit
      ? "radial-gradient(circle at 50% 37%, #ffe6ab 0%, #ffb232 38%, #e0730c 78%, #7c3d06 100%)"
      : "radial-gradient(circle at 50% 40%, #241f17 0%, #17130d 70%, #100d08 100%)",
    boxShadow: isHint
      ? `${glow}, 0 0 0 3px rgba(120,210,255,0.92), 0 0 22px 5px rgba(90,190,255,0.55)`
      : glow,
  };
}

export const panelClass =
  "rounded-xl border border-[#3a3024] bg-[#1a160f]/92 shadow-[0_10px_28px_rgba(0,0,0,0.55)] backdrop-blur-sm";

export const labelClass = "text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a5906f]";

export const primaryButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#7a3c06] bg-gradient-to-b from-[#ffb63e] to-[#df7c11] px-3.5 py-2 text-[12px] font-bold uppercase tracking-wide text-[#2a1602] shadow-[0_3px_0_rgba(110,55,6,0.9),0_6px_14px_rgba(0,0,0,0.45)] transition active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-40";

export const ghostButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#4a4030] bg-[#211b12] px-3.5 py-2 text-[12px] font-semibold uppercase tracking-wide text-[#e8d7ad] shadow-[0_2px_6px_rgba(0,0,0,0.4)] transition hover:border-[#6a5a3c] active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-40";

export function starStyle(filled: boolean, sizeRem: number): CSSProperties {
  return {
    fontSize: `${sizeRem}rem`,
    lineHeight: 1,
    color: filled ? "#ffbb3c" : "#463c2b",
    textShadow: filled ? "0 0 9px rgba(255,175,45,0.75)" : "none",
  };
}
