import type { CSSProperties, ReactNode } from "react";
import { clampFraction, hudTextShadow, HudLabel, KeybindBadge, useGameUiKeyframes } from "./chrome";
import { useGameUiTheme, type GameUiTheme } from "./theme";

export type ReticleVariant = "dot" | "cross" | "circle" | "chevron" | "shotgun";

function shadowFilter(): string {
  return "drop-shadow(0 1px 1px rgba(0,0,0,0.9))";
}

function radial(cx: number, cy: number, radius: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + Math.cos(rad) * radius, y: cy + Math.sin(rad) * radius };
}

export function Reticle({
  variant = "cross",
  size = 32,
  spread = 0,
  color,
  hit = false,
  className,
}: {
  variant?: ReticleVariant;
  size?: number;
  spread?: number;
  color?: string;
  hit?: boolean;
  className?: string;
}) {
  const theme = useGameUiTheme();
  useGameUiKeyframes();
  const strokeColor = color ?? theme.textPrimary;
  const k = size / 32;
  const vb = size * 1.6;
  const c = vb / 2;
  const s = clampFraction(spread);

  let inner: ReactNode = null;
  if (variant === "dot") {
    inner = (
      <>
        <circle cx={c} cy={c} r={4 * k} fill="none" stroke={strokeColor} strokeWidth={1.4 * k} opacity={0.6} />
        <circle cx={c} cy={c} r={2.2 * k} fill={strokeColor} />
      </>
    );
  } else if (variant === "cross") {
    const gap = (4 + s * 8) * k;
    const armLen = 9 * k;
    inner = (
      <>
        <line x1={c} y1={c - gap - armLen} x2={c} y2={c - gap} stroke={strokeColor} strokeWidth={2 * k} strokeLinecap="square" />
        <line x1={c} y1={c + gap} x2={c} y2={c + gap + armLen} stroke={strokeColor} strokeWidth={2 * k} strokeLinecap="square" />
        <line x1={c - gap - armLen} y1={c} x2={c - gap} y2={c} stroke={strokeColor} strokeWidth={2 * k} strokeLinecap="square" />
        <line x1={c + gap} y1={c} x2={c + gap + armLen} y2={c} stroke={strokeColor} strokeWidth={2 * k} strokeLinecap="square" />
        <circle cx={c} cy={c} r={1.2 * k} fill={strokeColor} />
      </>
    );
  } else if (variant === "circle") {
    const ringR = 10 * k;
    const tickInner = ringR + 1.5 * k;
    const tickOuter = ringR + 4.5 * k;
    const cardinals = [0, 90, 180, 270];
    inner = (
      <>
        <circle cx={c} cy={c} r={ringR} fill="none" stroke={strokeColor} strokeWidth={1.6 * k} />
        <circle cx={c} cy={c} r={1.2 * k} fill={strokeColor} />
        {cardinals.map((angle) => {
          const p1 = radial(c, c, tickInner, angle);
          const p2 = radial(c, c, tickOuter, angle);
          return <line key={angle} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={strokeColor} strokeWidth={1.6 * k} strokeLinecap="square" />;
        })}
      </>
    );
  } else if (variant === "chevron") {
    const apex = { x: c, y: c + 10 * k };
    const left = { x: c - 6 * k, y: c + 4 * k };
    const right = { x: c + 6 * k, y: c + 4 * k };
    inner = (
      <>
        <path
          d={`M ${left.x} ${left.y} L ${apex.x} ${apex.y} L ${right.x} ${right.y}`}
          fill="none"
          stroke={strokeColor}
          strokeWidth={2 * k}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={c} cy={c} r={1.2 * k} fill={strokeColor} />
      </>
    );
  } else {
    const shotgunR = (10 + s * 10) * k;
    const circumference = 2 * Math.PI * shotgunR;
    const segment = circumference / 8;
    inner = (
      <circle
        cx={c}
        cy={c}
        r={shotgunR}
        fill="none"
        stroke={strokeColor}
        strokeWidth={2 * k}
        strokeDasharray={`${segment} ${segment}`}
      />
    );
  }

  const hitTickRadius = c * 0.66;
  const hitTickHalf = 4 * k;

  return (
    <span
      className={className}
      data-jgui="reticle"
      data-variant={variant}
      style={{ position: "relative", display: "inline-flex", width: vb, height: vb, alignItems: "center", justifyContent: "center" }}
    >
      <svg width={vb} height={vb} viewBox={`0 0 ${vb} ${vb}`} style={{ filter: shadowFilter() }} aria-hidden>
        {inner}
        {hit &&
          [45, 135, 225, 315].map((angle) => {
            const p1 = radial(c, c, hitTickRadius - hitTickHalf, angle);
            const p2 = radial(c, c, hitTickRadius + hitTickHalf, angle);
            return (
              <line
                key={angle}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={theme.warning}
                strokeWidth={2 * k}
                strokeLinecap="square"
                style={{ animation: "jgui-flash 0.4s ease-out", transformOrigin: `${c}px ${c}px` }}
              />
            );
          })}
      </svg>
    </span>
  );
}

function LockBracket({ corner, color }: { corner: "tl" | "tr" | "bl" | "br"; color: string }) {
  const armSize = 12;
  const thickness = 2;
  const base: CSSProperties = { position: "absolute", width: armSize, height: armSize, pointerEvents: "none", filter: shadowFilter() };
  const edges: CSSProperties =
    corner === "tl"
      ? { top: 0, left: 0, borderTop: `${thickness}px solid ${color}`, borderLeft: `${thickness}px solid ${color}` }
      : corner === "tr"
        ? { top: 0, right: 0, borderTop: `${thickness}px solid ${color}`, borderRight: `${thickness}px solid ${color}` }
        : corner === "bl"
          ? { bottom: 0, left: 0, borderBottom: `${thickness}px solid ${color}`, borderLeft: `${thickness}px solid ${color}` }
          : { bottom: 0, right: 0, borderBottom: `${thickness}px solid ${color}`, borderRight: `${thickness}px solid ${color}` };
  return <span style={{ ...base, ...edges }} />;
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
  const theme = useGameUiTheme();
  useGameUiKeyframes();
  const markColor = color ?? theme.hostile;
  const frameSize = locked ? size * 0.78 : size;
  return (
    <span
      className={className}
      data-jgui="lock-on-marker"
      data-locked={locked}
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 4 }}
    >
      <span style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span
          style={{
            position: "absolute",
            width: frameSize,
            height: frameSize,
            transform: locked ? "rotate(45deg)" : "rotate(0deg)",
            transition: "width 0.15s ease-out, height 0.15s ease-out, transform 0.15s ease-out",
            animation: locked ? "none" : "jgui-spin 1.6s linear infinite",
          }}
        >
          <LockBracket corner="tl" color={markColor} />
          <LockBracket corner="tr" color={markColor} />
          <LockBracket corner="bl" color={markColor} />
          <LockBracket corner="br" color={markColor} />
        </span>
        {locked && (
          <span
            style={{
              position: "absolute",
              width: frameSize * 0.55,
              height: frameSize * 0.55,
              border: `1px solid ${markColor}`,
              transform: "rotate(45deg)",
            }}
          />
        )}
        <span
          style={{
            position: "absolute",
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: markColor,
            boxShadow: `0 0 4px ${markColor}`,
          }}
        />
      </span>
      {label !== undefined && (
        <span
          style={{
            fontFamily: theme.fontNumeric,
            fontSize: 9,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            color: markColor,
            textShadow: hudTextShadow(),
          }}
        >
          {label}
        </span>
      )}
    </span>
  );
}

export function DamageDirectionIndicator({
  angleDegrees,
  intensity = 1,
  radius = 120,
  active = true,
  className,
}: {
  angleDegrees: number;
  intensity?: number;
  radius?: number;
  active?: boolean;
  className?: string;
}) {
  const theme = useGameUiTheme();
  useGameUiKeyframes();
  if (!active) return null;
  const clampedIntensity = clampFraction(intensity);
  const vb = radius * 2.4;
  const cx = vb / 2;
  const cy = vb / 2;
  const halfSpan = 28;
  const p1 = radial(cx, cy, radius, -90 - halfSpan);
  const p2 = radial(cx, cy, radius, -90 + halfSpan);
  return (
    <span
      className={className}
      data-jgui="damage-direction"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <svg
        key={`${angleDegrees}-${clampedIntensity}`}
        width={vb}
        height={vb}
        viewBox={`0 0 ${vb} ${vb}`}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: `translate(-50%, -50%) rotate(${angleDegrees}deg)`,
        }}
        aria-hidden
      >
        <path
          d={`M ${p1.x} ${p1.y} A ${radius} ${radius} 0 0 1 ${p2.x} ${p2.y}`}
          fill="none"
          stroke={theme.danger}
          strokeWidth={14}
          strokeLinecap="butt"
          opacity={0.25 + clampedIntensity * 0.6}
          style={{
            filter: `drop-shadow(0 0 10px ${theme.danger})`,
            animation: "jgui-flash 0.9s ease-out forwards",
          }}
        />
      </svg>
    </span>
  );
}

export type WaypointMarkerKind = "objective" | "danger" | "ally" | "loot";

function waypointKindColor(theme: GameUiTheme, kind: WaypointMarkerKind): string {
  switch (kind) {
    case "objective":
      return theme.accent;
    case "danger":
      return theme.danger;
    case "ally":
      return theme.friendly;
    case "loot":
      return theme.rarity.legendary;
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
  const theme = useGameUiTheme();
  useGameUiKeyframes();
  const color = waypointKindColor(theme, kind);
  return (
    <span
      className={className}
      data-jgui="waypoint-marker"
      data-kind={kind}
      data-clamped={clamped}
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-50%, -50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        pointerEvents: "none",
      }}
    >
      {clamped ? (
        <span
          style={{
            width: 0,
            height: 0,
            borderLeft: "7px solid transparent",
            borderRight: "7px solid transparent",
            borderBottom: `14px solid ${color}`,
            transform: `rotate(${arrowAngle}deg)`,
            filter: shadowFilter(),
          }}
        />
      ) : icon !== undefined ? (
        icon
      ) : (
        <span
          style={{
            width: 16,
            height: 16,
            border: `2px solid ${color}`,
            background: "transparent",
            transform: "rotate(45deg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: kind === "objective" ? "jgui-pulse 2.4s infinite" : "none",
          }}
        >
          <span style={{ width: 6, height: 6, background: color }} />
        </span>
      )}
      {label !== undefined && (
        <span
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: 9,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            color,
            textShadow: hudTextShadow(),
          }}
        >
          {label}
        </span>
      )}
      {distance !== undefined && (
        <span style={{ fontFamily: theme.fontNumeric, fontSize: 9, color: theme.textDim }}>{distance}</span>
      )}
    </span>
  );
}

export interface HudMarker {
  id: string;
  x: number;
  y: number;
  label?: string;
  distance?: string;
  kind?: WaypointMarkerKind;
  clamped?: boolean;
  arrowAngle?: number;
}

export function HudMarkerLayer({ markers, className }: { markers: readonly HudMarker[]; className?: string }) {
  return (
    <span className={className} data-jgui="hud-marker-layer" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {markers.map((marker) => (
        <WaypointMarker
          key={marker.id}
          x={marker.x}
          y={marker.y}
          label={marker.label}
          distance={marker.distance}
          kind={marker.kind}
          clamped={marker.clamped}
          arrowAngle={marker.arrowAngle}
        />
      ))}
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
  const theme = useGameUiTheme();
  useGameUiKeyframes();
  const clamped = clampFraction(fraction);
  const r = size / 2 - 4;
  const circumference = 2 * Math.PI * r;
  const dashoffset = circumference * (1 - clamped);
  return (
    <span
      className={className}
      data-jgui="interaction-ring"
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 4 }}
    >
      <span style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute", inset: 0 }} aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={theme.edge} strokeWidth={3.5} opacity={0.5} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={theme.accent}
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashoffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ filter: `drop-shadow(0 0 6px ${theme.accentGlow})`, transition: "stroke-dashoffset 0.12s linear" }}
          />
        </svg>
        {keybind !== undefined && <KeybindBadge label={keybind} size="sm" />}
      </span>
      {label !== undefined && <HudLabel>{label}</HudLabel>}
    </span>
  );
}
