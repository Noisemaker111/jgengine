const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

export type StripTone = "accent" | "danger" | "warning" | "dim";

export interface StripMarker {
  id: string;
  /** Position along the strip in [0, 1]. */
  at: number;
  glyph?: string;
  tone?: StripTone;
  /** Larger marker with a label below (the player, the leader). */
  emphasis?: boolean;
  label?: string;
}

export interface StripSegment {
  from: number;
  to: number;
  tone?: StripTone;
  /** Dashed outline — a forecast/announced segment rather than a live one. */
  forecast?: boolean;
}

export interface StripLane {
  id: string;
  label?: string;
  markers: readonly StripMarker[];
  segments?: readonly StripSegment[];
}

function toneColor(tone: StripTone | undefined): string {
  if (tone === "danger") return "var(--jg-danger, #e0483e)";
  if (tone === "warning") return "var(--jg-warning, #e8a33d)";
  if (tone === "dim") return "var(--jg-text-dim, #a3947a)";
  return "var(--jg-accent, #e3b054)";
}

const clamp01 = (value: number) => (Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value)));

/**
 * Linear progress-strip minimap — race standings along a lap, couriers along a delivery line,
 * wave timers across a night. Each lane is a 1D track with moving markers and optional
 * live/forecast segments; feed it fractions, it never asks about the world.
 */
export function ProgressStrip({
  lanes,
  width = 300,
  laneHeight = 22,
  title,
  className,
}: {
  lanes: readonly StripLane[];
  width?: number;
  laneHeight?: number;
  title?: string;
  className?: string;
}) {
  const height = lanes.length * laneHeight;
  const trackInset = 10;
  const trackWidth = width - trackInset * 2;
  const xOf = (at: number) => trackInset + clamp01(at) * trackWidth;

  return (
    <div
      className={className}
      data-progress-strip
      style={{
        width,
        borderRadius: 10,
        padding: 8,
        background: "rgba(10,12,16,0.82)",
        border: "1px solid var(--jg-edge, #57452c)",
        color: "var(--jg-text, #f2e7d0)",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      {title !== undefined ? (
        <div
          style={{
            fontSize: 10,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            marginBottom: 4,
            color: "var(--jg-text-dim, #a3947a)",
            textShadow: HUD_TEXT_SHADOW,
          }}
        >
          {title}
        </div>
      ) : null}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {lanes.map((lane, index) => {
          const midY = index * laneHeight + laneHeight / 2;
          return (
            <g key={lane.id} data-strip-lane={lane.id}>
              <line
                x1={trackInset}
                y1={midY}
                x2={trackInset + trackWidth}
                y2={midY}
                stroke="var(--jg-edge, #57452c)"
                strokeWidth={2}
                strokeLinecap="round"
              />
              {(lane.segments ?? []).map((segment, segmentIndex) => (
                <line
                  key={`seg-${segmentIndex}`}
                  x1={xOf(segment.from)}
                  y1={midY}
                  x2={xOf(segment.to)}
                  y2={midY}
                  stroke={toneColor(segment.tone)}
                  strokeWidth={4}
                  strokeLinecap="round"
                  opacity={segment.forecast === true ? 0.7 : 0.85}
                  {...(segment.forecast === true ? { strokeDasharray: "5 4" } : {})}
                />
              ))}
              {lane.label !== undefined ? (
                <text
                  x={trackInset}
                  y={midY - 7}
                  fontSize={8}
                  fill="var(--jg-text-dim, #a3947a)"
                  style={{ textTransform: "uppercase", letterSpacing: 1 }}
                >
                  {lane.label}
                </text>
              ) : null}
              {lane.markers.map((marker) => {
                const x = xOf(marker.at);
                const color = toneColor(marker.tone);
                const radius = marker.emphasis === true ? 6.5 : 4.5;
                return (
                  <g key={marker.id} data-strip-marker={marker.id}>
                    <circle cx={x} cy={midY} r={radius} fill="rgba(6,8,12,0.9)" stroke={color} strokeWidth={1.5} />
                    {marker.glyph !== undefined ? (
                      <text x={x} y={midY + 2.8} textAnchor="middle" fontSize={radius + 1.5} fill={color} style={{ fontWeight: 700 }}>
                        {marker.glyph}
                      </text>
                    ) : null}
                    {marker.label !== undefined ? (
                      <text
                        x={x}
                        y={midY + radius + 8}
                        textAnchor="middle"
                        fontSize={8}
                        fill="var(--jg-text, #f2e7d0)"
                        style={{ textShadow: HUD_TEXT_SHADOW }}
                      >
                        {marker.label}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
