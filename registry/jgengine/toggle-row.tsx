import type { CSSProperties, ReactNode } from "react";

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

const slantBar = (lean: number) =>
  `polygon(${lean}px 0, 100% 0, calc(100% - ${lean}px) 100%, 0 100%)`;

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

export function ToggleRow({
  label,
  value,
  onChange,
  onLabel = "On",
  offLabel = "Off",
  className,
}: {
  label: string;
  value: boolean;
  onChange?: (value: boolean) => void;
  onLabel?: string;
  offLabel?: string;
  className?: string;
}) {
  function segmentStyle(active: boolean): CSSProperties {
    return {
      clipPath: slantBar(4),
      fontFamily: "var(--jg-font-display)",
      background: active
        ? "linear-gradient(180deg, var(--jg-accent) 0%, var(--jg-accent-deep) 100%)"
        : "transparent",
      color: active ? "var(--jg-surface-deep)" : "var(--jg-text-dim)",
      border: active ? "none" : "1px solid var(--jg-edge)",
    };
  }
  return (
    <div className={`flex items-center justify-between ${className ?? ""}`} data-jg="toggle-row">
      <HudLabel>{label}</HudLabel>
      <button
        type="button"
        onClick={() => onChange?.(!value)}
        className="flex cursor-pointer gap-0.5 border-none bg-transparent p-0"
      >
        <span className="px-3.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em]" style={segmentStyle(!value)}>
          {offLabel}
        </span>
        <span className="px-3.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em]" style={segmentStyle(value)}>
          {onLabel}
        </span>
      </button>
    </div>
  );
}
