import { useId } from "react";

import { GEMS, type Point } from "../gems";

const CENTER = 50;

function toward(p: Point, t: number): Point {
  return [p[0] + (CENTER - p[0]) * t, p[1] + (CENTER - p[1]) * t];
}

function pointsAttr(pts: readonly Point[]): string {
  return pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");
}

/**
 * A cut-gem jewel. Its silhouette (kite, octagon, step-cut, trillion, marquise,
 * pear, hexagon) is the colour-blind-safe identity; a shared brilliant-cut facet
 * pattern (table + radiating facet lines + a sparkle) gives every shape the same
 * faceted read. Never a plain circle.
 */
export function GemJewel({ kind, className }: { kind: number; className?: string }) {
  const gem = GEMS[kind] ?? GEMS[0]!;
  const raw = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gradId = `gcg${raw}`;
  const outline = gem.outline;
  const table = outline.map((p) => toward(p, 0.46));

  return (
    <svg viewBox="0 0 100 100" className={className} width="100%" height="100%" aria-hidden focusable="false">
      <defs>
        <linearGradient id={gradId} x1="0.2" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor={gem.light} />
          <stop offset="48%" stopColor={gem.base} />
          <stop offset="100%" stopColor={gem.dark} />
        </linearGradient>
      </defs>

      <polygon
        points={pointsAttr(outline)}
        fill={`url(#${gradId})`}
        stroke={gem.dark}
        strokeWidth={2}
        strokeLinejoin="round"
      />

      <g stroke={gem.light} strokeOpacity={0.32} strokeWidth={0.9} fill="none">
        {outline.map((p, i) => {
          const t = table[i]!;
          return <line key={i} x1={p[0]} y1={p[1]} x2={t[0]} y2={t[1]} />;
        })}
      </g>

      <polygon
        points={pointsAttr(table)}
        fill={gem.light}
        fillOpacity={0.5}
        stroke={gem.light}
        strokeOpacity={0.55}
        strokeWidth={0.9}
        strokeLinejoin="round"
      />

      <ellipse cx={40} cy={33} rx={8} ry={4.5} fill="#ffffff" opacity={0.7} transform="rotate(-28 40 33)" />
    </svg>
  );
}
