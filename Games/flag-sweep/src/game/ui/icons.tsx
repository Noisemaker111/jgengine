import { SIGNAL_RED } from "./theme";

export type FaceMood = "smile" | "worried" | "dead" | "cool";

export function FaceIcon({ mood, size = 30 }: { mood: FaceMood; size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} role="img" aria-label={`face ${mood}`}>
      <circle cx="16" cy="16" r="13" fill="#facc15" stroke="#a16207" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="13" fill="url(#faceShine)" />
      <defs>
        <radialGradient id="faceShine" cx="0.35" cy="0.3" r="0.75">
          <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
          <stop offset="55%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>
      {mood === "dead" ? (
        <>
          <path d="M9 11 l5 4 M14 11 l-5 4" stroke="#1f2937" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M18 11 l5 4 M23 11 l-5 4" stroke="#1f2937" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M11 23 q5 -4 10 0" fill="none" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
        </>
      ) : mood === "cool" ? (
        <>
          <rect x="7" y="12" width="8" height="5" rx="1.5" fill="#111827" />
          <rect x="17" y="12" width="8" height="5" rx="1.5" fill="#111827" />
          <path d="M15 14 h2" stroke="#111827" strokeWidth="1.4" />
          <path d="M11 22 q5 4 10 0" fill="none" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
        </>
      ) : mood === "worried" ? (
        <>
          <circle cx="12" cy="14" r="1.9" fill="#1f2937" />
          <circle cx="20" cy="14" r="1.9" fill="#1f2937" />
          <circle cx="16" cy="23" r="2.4" fill="none" stroke="#1f2937" strokeWidth="1.7" />
        </>
      ) : (
        <>
          <circle cx="12" cy="14" r="1.9" fill="#1f2937" />
          <circle cx="20" cy="14" r="1.9" fill="#1f2937" />
          <path d="M10 20 q6 6 12 0" fill="none" stroke="#1f2937" strokeWidth="1.9" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function FlagIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label="flag">
      <rect x="10.6" y="4" width="2.2" height="15" rx="1" fill="#1f2937" />
      <rect x="6" y="18" width="12" height="3" rx="1.2" fill="#111827" />
      <path d="M12.5 4.4 L6 8 L12.5 11.4 Z" fill={SIGNAL_RED} stroke="#9b1c14" strokeWidth="0.6" />
    </svg>
  );
}

export function MineIcon({ size = 20, danger = false }: { size?: number; danger?: boolean }) {
  const body = danger ? "#3b0d0a" : "#141a24";
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label="mine">
      <g stroke={body} strokeWidth="2" strokeLinecap="round">
        <path d="M12 3 V21 M3 12 H21 M5.5 5.5 L18.5 18.5 M18.5 5.5 L5.5 18.5" />
      </g>
      <circle cx="12" cy="12" r="5.4" fill={body} />
      <circle cx="10.2" cy="10.2" r="1.6" fill="rgba(255,255,255,0.75)" />
    </svg>
  );
}
