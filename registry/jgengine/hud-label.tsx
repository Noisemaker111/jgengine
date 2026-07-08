import type { ReactNode } from "react";

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

export function HudLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-[0.24em] ${className ?? ""}`}
      style={{
        fontFamily: "var(--jg-font-display)",
        color: "var(--jg-text-dim)",
        textShadow: HUD_TEXT_SHADOW,
      }}
    >
      {children}
    </span>
  );
}
