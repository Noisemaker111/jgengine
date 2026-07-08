import type { CSSProperties } from "react";

const SHADOW_FILTER = "drop-shadow(0 1px 1px rgba(0,0,0,0.9))";
const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

function LockBracket({ corner, color }: { corner: "tl" | "tr" | "bl" | "br"; color: string }) {
  const armSize = 12;
  const thickness = 2;
  const edges: CSSProperties =
    corner === "tl"
      ? { top: 0, left: 0, borderTop: `${thickness}px solid ${color}`, borderLeft: `${thickness}px solid ${color}` }
      : corner === "tr"
        ? { top: 0, right: 0, borderTop: `${thickness}px solid ${color}`, borderRight: `${thickness}px solid ${color}` }
        : corner === "bl"
          ? { bottom: 0, left: 0, borderBottom: `${thickness}px solid ${color}`, borderLeft: `${thickness}px solid ${color}` }
          : { bottom: 0, right: 0, borderBottom: `${thickness}px solid ${color}`, borderRight: `${thickness}px solid ${color}` };
  return (
    <span
      className="pointer-events-none absolute"
      style={{ width: armSize, height: armSize, filter: SHADOW_FILTER, ...edges }}
    />
  );
}

export function LockOnMarker({
  locked = true,
  size = 44,
  color,
  label,
  className,
}: {
  locked?: boolean;
  size?: number;
  color?: string;
  label?: string;
  className?: string;
}) {
  const markColor = color ?? "var(--jg-hostile)";
  const frameSize = locked ? size * 0.78 : size;
  return (
    <span
      className={`inline-flex flex-col items-center gap-1 ${className ?? ""}`}
      data-jg="lock-on-marker"
      data-locked={locked}
    >
      <span className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <span
          className="absolute"
          style={{
            width: frameSize,
            height: frameSize,
            transform: locked ? "rotate(45deg)" : "rotate(0deg)",
            transition: "width 0.15s ease-out, height 0.15s ease-out, transform 0.15s ease-out",
            animation: locked ? "none" : "jg-spin 1.6s linear infinite",
          }}
        >
          <LockBracket corner="tl" color={markColor} />
          <LockBracket corner="tr" color={markColor} />
          <LockBracket corner="bl" color={markColor} />
          <LockBracket corner="br" color={markColor} />
        </span>
        {locked && (
          <span
            className="absolute"
            style={{
              width: frameSize * 0.55,
              height: frameSize * 0.55,
              border: `1px solid ${markColor}`,
              transform: "rotate(45deg)",
            }}
          />
        )}
        <span
          className="absolute rounded-full"
          style={{ width: 4, height: 4, background: markColor, boxShadow: `0 0 4px ${markColor}` }}
        />
      </span>
      {label !== undefined && (
        <span
          className="font-mono text-[9px] font-bold uppercase tracking-[0.2em]"
          style={{ color: markColor, textShadow: HUD_TEXT_SHADOW }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
