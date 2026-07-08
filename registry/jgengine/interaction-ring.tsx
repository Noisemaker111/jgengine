import type { ReactNode } from "react";

import { KeybindBadge } from "@/components/ui/keybind-badge";

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

const clampFraction = (value: number) =>
  Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value));

function HudLabel({ children }: { children: ReactNode }) {
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-[0.24em]"
      style={{ fontFamily: "var(--jg-font-display)", color: "var(--jg-text-dim)", textShadow: HUD_TEXT_SHADOW }}
    >
      {children}
    </span>
  );
}

export function InteractionRing({
  fraction,
  size = 54,
  keybind,
  label,
  className,
}: {
  fraction: number;
  size?: number;
  keybind?: string;
  label?: string;
  className?: string;
}) {
  const clamped = clampFraction(fraction);
  const r = size / 2 - 4;
  const circumference = 2 * Math.PI * r;
  const dashoffset = circumference * (1 - clamped);
  return (
    <span className={`inline-flex flex-col items-center gap-1 ${className ?? ""}`} data-jg="interaction-ring">
      <span className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--jg-edge)" strokeWidth={3.5} opacity={0.5} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--jg-accent)"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashoffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ filter: "drop-shadow(0 0 6px var(--jg-accent-glow))", transition: "stroke-dashoffset 0.12s linear" }}
          />
        </svg>
        {keybind !== undefined && <KeybindBadge label={keybind} size="sm" />}
      </span>
      {label !== undefined && <HudLabel>{label}</HudLabel>}
    </span>
  );
}
