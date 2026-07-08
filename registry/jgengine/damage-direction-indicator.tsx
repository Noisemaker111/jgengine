const clampFraction = (value: number) =>
  Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value));

function radial(cx: number, cy: number, radius: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + Math.cos(rad) * radius, y: cy + Math.sin(rad) * radius };
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
  if (!active) return null;
  const clampedIntensity = clampFraction(intensity);
  const vb = radius * 2.4;
  const cx = vb / 2;
  const cy = vb / 2;
  const halfSpan = 28;
  const p1 = radial(cx, cy, radius, -90 - halfSpan);
  const p2 = radial(cx, cy, radius, -90 + halfSpan);
  return (
    <span className={`pointer-events-none absolute inset-0 ${className ?? ""}`} data-jg="damage-direction">
      <svg
        key={`${angleDegrees}-${clampedIntensity}`}
        width={vb}
        height={vb}
        viewBox={`0 0 ${vb} ${vb}`}
        className="absolute left-1/2 top-1/2"
        style={{ transform: `translate(-50%, -50%) rotate(${angleDegrees}deg)` }}
        aria-hidden
      >
        <path
          d={`M ${p1.x} ${p1.y} A ${radius} ${radius} 0 0 1 ${p2.x} ${p2.y}`}
          fill="none"
          stroke="var(--jg-danger)"
          strokeWidth={14}
          strokeLinecap="butt"
          opacity={0.25 + clampedIntensity * 0.6}
          style={{
            filter: "drop-shadow(0 0 10px var(--jg-danger))",
            animation: "jg-flash 0.9s ease-out forwards",
          }}
        />
      </svg>
    </span>
  );
}
