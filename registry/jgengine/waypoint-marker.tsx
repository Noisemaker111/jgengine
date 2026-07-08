import type { ReactNode } from "react";

export type WaypointMarkerKind = "objective" | "danger" | "ally" | "loot";

const SHADOW_FILTER = "drop-shadow(0 1px 1px rgba(0,0,0,0.9))";
const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

function waypointKindColor(kind: WaypointMarkerKind): string {
  switch (kind) {
    case "objective":
      return "var(--jg-accent)";
    case "danger":
      return "var(--jg-danger)";
    case "ally":
      return "var(--jg-friendly)";
    case "loot":
      return "var(--jg-rarity-legendary)";
  }
}

export function WaypointMarker({
  x,
  y,
  label,
  distance,
  kind = "objective",
  clamped = false,
  arrowAngle = 0,
  icon,
  className,
}: {
  x: number;
  y: number;
  label?: string;
  distance?: string;
  kind?: WaypointMarkerKind;
  clamped?: boolean;
  arrowAngle?: number;
  icon?: ReactNode;
  className?: string;
}) {
  const color = waypointKindColor(kind);
  return (
    <span
      className={`pointer-events-none absolute flex flex-col items-center gap-0.5 ${className ?? ""}`}
      data-jg="waypoint-marker"
      data-kind={kind}
      data-clamped={clamped}
      style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
    >
      {clamped ? (
        <span
          className="h-0 w-0"
          style={{
            borderLeft: "7px solid transparent",
            borderRight: "7px solid transparent",
            borderBottom: `14px solid ${color}`,
            transform: `rotate(${arrowAngle}deg)`,
            filter: SHADOW_FILTER,
          }}
        />
      ) : icon !== undefined ? (
        icon
      ) : (
        <span
          className="flex items-center justify-center"
          style={{
            width: 16,
            height: 16,
            border: `2px solid ${color}`,
            background: "transparent",
            transform: "rotate(45deg)",
            animation: kind === "objective" ? "jg-pulse 2.4s infinite" : "none",
          }}
        >
          <span style={{ width: 6, height: 6, background: color }} />
        </span>
      )}
      {label !== undefined && (
        <span
          className="text-[9px] font-bold uppercase tracking-[0.18em]"
          style={{ fontFamily: "var(--jg-font-display)", color, textShadow: HUD_TEXT_SHADOW }}
        >
          {label}
        </span>
      )}
      {distance !== undefined && (
        <span className="font-mono text-[9px]" style={{ color: "var(--jg-text-dim)" }}>
          {distance}
        </span>
      )}
    </span>
  );
}
