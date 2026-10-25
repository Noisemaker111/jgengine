import { useId, type CSSProperties } from "react";

/**
 * The beacon's iron brazier, drawn in code. `strength` (0..1) is how high the fire burns: the
 * title and pause screens keep it full, the HUD ties it to the keep's lives so a failing keep
 * visibly gutters. At 0 only the coals glow. Flicker is CSS and stops under reduced motion.
 */
export function Brazier({ size = 64, strength = 1, className, style }: { size?: number; strength?: number; className?: string; style?: CSSProperties }) {
  const fire = Math.max(0, Math.min(1, strength));
  const scale = 0.35 + fire * 0.65;
  const lit = fire > 0.02;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const id = (name: string) => `bb-${name}-${uid}`;
  return (
    <svg
      className={`bb-brazier ${className ?? ""}`}
      width={size}
      height={size * 1.25}
      viewBox="0 0 64 80"
      role="presentation"
      aria-hidden
      style={style}
    >
      <defs>
        <radialGradient id={id("glow")} cx="50%" cy="60%" r="50%">
          <stop offset="0%" stopColor="#ffcf7a" stopOpacity={0.75 * fire} />
          <stop offset="55%" stopColor="#ff7a1a" stopOpacity={0.25 * fire} />
          <stop offset="100%" stopColor="#ff5a00" stopOpacity={0} />
        </radialGradient>
        <linearGradient id={id("iron")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6d6156" />
          <stop offset="45%" stopColor="#2c2622" />
          <stop offset="100%" stopColor="#120f0c" />
        </linearGradient>
        <linearGradient id={id("flame-a")} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#ff4d0a" />
          <stop offset="100%" stopColor="#ff9a2e" stopOpacity={0.15} />
        </linearGradient>
        <linearGradient id={id("flame-b")} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#ff8a1c" />
          <stop offset="100%" stopColor="#ffd35a" stopOpacity={0.4} />
        </linearGradient>
        <linearGradient id={id("flame-c")} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#fff2b0" />
          <stop offset="100%" stopColor="#ffe07a" stopOpacity={0.6} />
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="34" rx="32" ry="34" fill={`url(#${id("glow")})`} />
      {lit ? (
        <g style={{ transform: `scale(${scale})`, transformOrigin: "32px 47px" }}>
          <path className="bb-flame bb-flame-a" fill={`url(#${id("flame-a")})`} d="M32 2 C41 15 49 24 47 35 C46 43 39 48 32 48 C25 48 18 43 17 35 C15 24 24 16 32 2 Z" />
          <path className="bb-flame bb-flame-b" fill={`url(#${id("flame-b")})`} d="M33 13 C39 22 43 29 42 37 C41 43 37 47 32 47 C27 47 23 43 22 37 C21 30 27 23 33 13 Z" />
          <path className="bb-flame bb-flame-c" fill={`url(#${id("flame-c")})`} d="M32 26 C36 31 38 36 37 40 C36 44 34 46 32 46 C30 46 28 44 27 40 C26 36 29 31 32 26 Z" />
        </g>
      ) : null}
      <ellipse cx="32" cy="46.5" rx="17" ry="3.2" fill={lit ? "#ff9a3a" : "#7a2a0c"} opacity={lit ? 0.95 : 0.8} />
      <path d="M11 45 H53 L46 58 H18 Z" fill={`url(#${id("iron")})`} stroke="#0c0a08" strokeWidth="1.2" />
      <rect x="9" y="43" width="46" height="4.5" rx="1.5" fill="#4a4038" stroke="#0c0a08" strokeWidth="1" />
      <path d="M12 44 H52" stroke="#a89580" strokeWidth="0.8" opacity="0.7" />
      <path d="M21 58 L14 77 M43 58 L50 77 M32 58 V77" stroke="#1d1814" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M17 68 H47" stroke="#1d1814" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
