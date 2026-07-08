import type { ReactNode } from "react";

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

export function AmmoCounter({
  magazine,
  reserve,
  lowAt = 5,
  reloading = false,
  icon,
  className,
}: {
  magazine: number;
  reserve?: number;
  lowAt?: number;
  reloading?: boolean;
  icon?: ReactNode;
  className?: string;
}) {
  const isLow = magazine <= lowAt;
  return (
    <div className={`flex flex-col items-end gap-0.5 ${className ?? ""}`} data-jg="ammo-counter">
      {reloading && (
        <span
          className="text-[10px] font-bold uppercase tracking-[0.24em]"
          style={{
            fontFamily: "var(--jg-font-display)",
            color: "var(--jg-warning)",
            textShadow: HUD_TEXT_SHADOW,
            animation: "jg-pulse 1s infinite",
          }}
        >
          Reloading
        </span>
      )}
      <div className="flex items-baseline gap-2">
        {icon !== undefined && (
          <span className="inline-flex h-5 w-5 items-center justify-center" style={{ color: "var(--jg-text-dim)" }}>
            {icon}
          </span>
        )}
        <span
          className="font-mono text-[38px] font-extrabold"
          style={{
            color: isLow ? "var(--jg-danger)" : "var(--jg-text)",
            textShadow: HUD_TEXT_SHADOW,
            animation: isLow ? "jg-pulse 1s infinite" : "none",
          }}
        >
          {magazine}
        </span>
        <span
          aria-hidden
          className="inline-block h-[26px] w-0.5 -skew-x-[18deg]"
          style={{ background: "var(--jg-edge-bright)" }}
        />
        {reserve !== undefined && (
          <span
            className="font-mono text-base font-bold"
            style={{ color: "var(--jg-text-dim)", textShadow: HUD_TEXT_SHADOW }}
          >
            {reserve}
          </span>
        )}
      </div>
    </div>
  );
}
