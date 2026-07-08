import type { ReactNode } from "react";

export type ReticleVariant = "dot" | "cross" | "circle" | "chevron" | "shotgun";

const SHADOW_FILTER = "drop-shadow(0 1px 1px rgba(0,0,0,0.9))";

const clampFraction = (value: number) =>
  Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value));

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
  const strokeColor = color ?? "var(--jg-text)";
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
      className={`relative inline-flex items-center justify-center ${className ?? ""}`}
      data-jg="reticle"
      data-variant={variant}
      style={{ width: vb, height: vb }}
    >
      <svg width={vb} height={vb} viewBox={`0 0 ${vb} ${vb}`} style={{ filter: SHADOW_FILTER }} aria-hidden>
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
                stroke="var(--jg-warning)"
                strokeWidth={2 * k}
                strokeLinecap="square"
                style={{ animation: "jg-flash 0.4s ease-out", transformOrigin: `${c}px ${c}px` }}
              />
            );
          })}
      </svg>
    </span>
  );
}
