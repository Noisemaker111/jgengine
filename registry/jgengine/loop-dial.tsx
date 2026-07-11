const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

export type DialTone = "accent" | "danger" | "warning" | "dim";

export interface DialMarker {
  id: string;
  /** Position around the loop in [0, 1): 0 = top, clockwise. */
  at: number;
  glyph?: string;
  tone?: DialTone;
  emphasis?: boolean;
}

export interface DialArc {
  from: number;
  to: number;
  tone?: DialTone;
  /** Dashed — an announced/forecast window rather than a live one. */
  forecast?: boolean;
}

function toneColor(tone: DialTone | undefined): string {
  if (tone === "danger") return "var(--jg-danger, #e0483e)";
  if (tone === "warning") return "var(--jg-warning, #e8a33d)";
  if (tone === "dim") return "var(--jg-text-dim, #a3947a)";
  return "var(--jg-accent, #e3b054)";
}

function pointAt(cx: number, cy: number, radius: number, at: number): { x: number; y: number } {
  const angle = at * Math.PI * 2 - Math.PI / 2;
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

function arcPath(cx: number, cy: number, radius: number, from: number, to: number): string {
  const span = ((to - from) % 1 + 1) % 1;
  const start = pointAt(cx, cy, radius, from);
  const end = pointAt(cx, cy, radius, from + span);
  const largeArc = span > 0.5 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/**
 * Radial loop dial — positions around a repeating cycle: racers around a lap, patrols around a
 * route, hazards around a rotation schedule. Fractions in [0, 1) around the circle (0 = top,
 * clockwise); arcs mark live and forecast windows.
 */
export function LoopDial({
  markers,
  arcs = [],
  size = 120,
  label,
  readout,
  className,
}: {
  markers: readonly DialMarker[];
  arcs?: readonly DialArc[];
  size?: number;
  label?: string;
  readout?: string;
  className?: string;
}) {
  const half = size / 2;
  const radius = half - 12;

  return (
    <div
      className={className}
      data-loop-dial
      style={{
        width: size,
        borderRadius: 10,
        padding: 8,
        background: "rgba(10,12,16,0.82)",
        border: "1px solid var(--jg-edge, #57452c)",
        color: "var(--jg-text, #f2e7d0)",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        textAlign: "center" as const,
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={half} cy={half} r={radius} fill="none" stroke="var(--jg-edge, #57452c)" strokeWidth={2} />
        {arcs.map((arc, index) => (
          <path
            key={`arc-${index}`}
            d={arcPath(half, half, radius, arc.from, arc.to)}
            fill="none"
            stroke={toneColor(arc.tone)}
            strokeWidth={4}
            strokeLinecap="round"
            opacity={arc.forecast === true ? 0.7 : 0.85}
            {...(arc.forecast === true ? { strokeDasharray: "5 4" } : {})}
          />
        ))}
        {markers.map((marker) => {
          const at = pointAt(half, half, radius, ((marker.at % 1) + 1) % 1);
          const color = toneColor(marker.tone);
          const markerRadius = marker.emphasis === true ? 6.5 : 4.5;
          return (
            <g key={marker.id} data-dial-marker={marker.id}>
              <circle cx={at.x} cy={at.y} r={markerRadius} fill="rgba(6,8,12,0.9)" stroke={color} strokeWidth={1.5} />
              {marker.glyph !== undefined ? (
                <text x={at.x} y={at.y + 2.8} textAnchor="middle" fontSize={markerRadius + 1.5} fill={color} style={{ fontWeight: 700 }}>
                  {marker.glyph}
                </text>
              ) : null}
            </g>
          );
        })}
        {readout !== undefined ? (
          <text
            x={half}
            y={half + 4}
            textAnchor="middle"
            fontSize={16}
            fill="var(--jg-text, #f2e7d0)"
            style={{ fontWeight: 700, textShadow: HUD_TEXT_SHADOW }}
          >
            {readout}
          </text>
        ) : null}
      </svg>
      {label !== undefined ? (
        <div
          style={{
            fontSize: 10,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            marginTop: 2,
            color: "var(--jg-text-dim, #a3947a)",
            textShadow: HUD_TEXT_SHADOW,
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
}
