import { useEffect, useRef, useState } from "react";

export function HitMarker({
  active,
  crit = false,
  size = 26,
  className,
}: {
  active: boolean;
  crit?: boolean;
  size?: number;
  className?: string;
}) {
  const [pulse, setPulse] = useState(0);
  const wasActive = useRef(false);
  useEffect(() => {
    if (active && !wasActive.current) setPulse((count) => count + 1);
    wasActive.current = active;
  }, [active]);
  if (!active) return null;
  const color = crit ? "var(--jg-warning)" : "var(--jg-text)";
  const half = size / 2;
  const inner = size * 0.22;
  const outer = size * 0.5;
  return (
    <svg
      key={pulse}
      className={className}
      data-jg="hit-marker"
      data-crit={crit}
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        filter: `drop-shadow(0 0 4px ${color})`,
        animation: "jg-flash 0.28s ease-out forwards",
      }}
    >
      <line x1={half - outer} y1={half - outer} x2={half - inner} y2={half - inner} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <line x1={half + inner} y1={half + inner} x2={half + outer} y2={half + outer} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <line x1={half + outer} y1={half - outer} x2={half + inner} y2={half - inner} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <line x1={half - inner} y1={half + inner} x2={half - outer} y2={half + outer} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  );
}
