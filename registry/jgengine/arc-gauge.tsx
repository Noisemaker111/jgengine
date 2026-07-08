const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

const clampFraction = (value: number) => (Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value)));

function polarToCartesian(cx: number, cy: number, radius: number, angleDegrees: number): { x: number; y: number } {
  const angleRadians = ((angleDegrees - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(angleRadians), y: cy + radius * Math.sin(angleRadians) };
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

export function ArcGauge({
  fraction,
  label,
  readout,
  size = 110,
  tone = "accent",
  sweepDegrees = 240,
  className,
}: {
  fraction: number;
  label?: string;
  readout?: string;
  size?: number;
  tone?: "accent" | "danger" | "warning";
  sweepDegrees?: number;
  className?: string;
}) {
  const clamped = clampFraction(fraction);
  const toneColor =
    tone === "danger" ? "var(--jg-danger)" : tone === "warning" ? "var(--jg-warning)" : "var(--jg-accent)";
  const cx = size / 2;
  const cy = size / 2;
  const strokeWidth = size / 12;
  const radius = size / 2 - strokeWidth;
  const startAngle = -sweepDegrees / 2;
  const endAngle = sweepDegrees / 2;
  const sweepAngle = startAngle + clamped * sweepDegrees;
  const ticks = Array.from({ length: 11 }, (_, index) => index * 0.1).filter((tick) => tick <= 1);
  return (
    <div className={`relative ${className ?? ""}`} data-jg="arc-gauge" data-tone={tone} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <path
          d={describeArc(cx, cy, radius, startAngle, endAngle)}
          fill="none"
          stroke="var(--jg-edge)"
          strokeOpacity={0.4}
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
        />
        {ticks.map((tick) => {
          const angle = startAngle + tick * sweepDegrees;
          const inner = polarToCartesian(cx, cy, radius - strokeWidth / 2 - 2, angle);
          const outer = polarToCartesian(cx, cy, radius + strokeWidth / 2 + 2, angle);
          return (
            <line
              key={tick}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="var(--jg-edge)"
              strokeWidth={1}
            />
          );
        })}
        {clamped > 0 && (
          <path
            d={describeArc(cx, cy, radius, startAngle, sweepAngle)}
            fill="none"
            stroke={toneColor}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
            style={{ filter: `drop-shadow(0 0 6px ${toneColor})` }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        {readout !== undefined && (
          <span
            className="font-mono font-extrabold"
            style={{ fontSize: size / 4.5, color: "var(--jg-text)", textShadow: HUD_TEXT_SHADOW }}
          >
            {readout}
          </span>
        )}
        {label !== undefined && (
          <span
            className="text-[10px] font-bold uppercase tracking-[0.24em]"
            style={{ color: "var(--jg-text-dim)", textShadow: HUD_TEXT_SHADOW }}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
