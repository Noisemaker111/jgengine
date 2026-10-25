import { useId } from "react";

/** A ragged disc of poured wax: a ring of 28 points pushed in and out by a fixed jitter, so every seal
 * keeps the same drip and nothing is random between renders. */
function waxOutline(radius: number): string {
  const jitter = [0.0, 0.9, -0.6, 1.4, 0.3, -1.1, 0.8, 1.8, -0.4, 0.6, -1.3, 0.2, 1.1, -0.7, 2.0, 0.4, -0.9, 0.7, 1.3, -0.5, 0.1, -1.2, 0.9, 1.6, -0.3, 0.5, -0.8, 1.0];
  const points = jitter.map((offset, index) => {
    const angle = (index / jitter.length) * Math.PI * 2;
    const r = radius + offset;
    return `${(32 + Math.cos(angle) * r).toFixed(2)},${(32 + Math.sin(angle) * r).toFixed(2)}`;
  });
  return `M${points.join(" L")} Z`;
}

const OUTER = waxOutline(29);

/**
 * A wax seal pressed with the Vanguard's ember: the campaign's mark on the title map, the dispatch and
 * the pause seal. `emblem` picks what the die pressed; the wax colour is the seal's own.
 */
export function WaxSeal({
  size = 64,
  wax = "#8e1f17",
  emblem = "ember",
  className,
}: {
  size?: number;
  wax?: string;
  emblem?: "ember" | "pause" | "star";
  className?: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg className={`ec-wax ${className ?? ""}`} width={size} height={size} viewBox="0 0 64 64" overflow="visible" aria-hidden>
      <defs>
        <radialGradient id={`w${id}`} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="0.35" stopColor={wax} stopOpacity="1" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.55" />
        </radialGradient>
      </defs>
      {/* The seal's cast shadow, drawn in, not a CSS filter: the seal sits over the live battlefield. */}
      <path d={OUTER} fill="#000" fillOpacity="0.22" transform="translate(0.6,3.4) translate(32,32) scale(1.02) translate(-32,-32)" />
      <path d={OUTER} fill="#000" fillOpacity="0.28" transform="translate(0,2.4)" />
      <path d={OUTER} fill={wax} />
      <path d={OUTER} fill={`url(#w${id})`} />
      {/* The die's pressed rim. */}
      <circle cx="32" cy="32" r="20" fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="2.4" />
      <circle cx="32" cy="32" r="20" fill="none" stroke="#fff" strokeOpacity="0.16" strokeWidth="1" transform="translate(-0.8,-0.8)" />
      <g fill="#000" fillOpacity="0.5" transform="translate(0.8,0.9)">
        <Emblem kind={emblem} />
      </g>
      <g fill="#ffd9c8" fillOpacity="0.36">
        <Emblem kind={emblem} />
      </g>
    </svg>
  );
}

function Emblem({ kind }: { kind: "ember" | "pause" | "star" }) {
  if (kind === "pause") {
    return (
      <>
        <rect x="24" y="22" width="5.5" height="20" rx="1" />
        <rect x="34.5" y="22" width="5.5" height="20" rx="1" />
      </>
    );
  }
  if (kind === "star") {
    return <path d="M32 19 L35.2 28.4 L45 28.6 L37.2 34.6 L40 44 L32 38.4 L24 44 L26.8 34.6 L19 28.6 L28.8 28.4 Z" />;
  }
  // The ember: a flame rising from a coal.
  return (
    <>
      <path d="M32 17 C35 23 41 26 40 34 C39.4 39.5 35.8 43 32 43 C28.2 43 24.6 39.5 24 34 C23.4 28.6 27.4 26.4 28.6 22.4 C30 25.6 30.6 27.4 32.4 28.6 C33.6 24.8 33.6 21 32 17 Z" />
      <rect x="25" y="44.5" width="14" height="3" rx="1.5" />
    </>
  );
}
