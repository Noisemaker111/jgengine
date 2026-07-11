export function CardBackFiligree() {
  return (
    <svg viewBox="0 0 60 84" className="h-full w-full" aria-hidden="true" preserveAspectRatio="none">
      <defs>
        <radialGradient id="mmLacquer" cx="50%" cy="38%" r="85%">
          <stop offset="0%" stopColor="#1b3159" />
          <stop offset="62%" stopColor="#12244a" />
          <stop offset="100%" stopColor="#0c1a38" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="60" height="84" fill="url(#mmLacquer)" />
      <rect x="2.6" y="2.6" width="54.8" height="78.8" rx="4" fill="none" stroke="#c9a557" strokeWidth="1.1" opacity="0.9" />
      <rect x="5.4" y="5.4" width="49.2" height="73.2" rx="2.6" fill="none" stroke="#c9a557" strokeWidth="0.45" opacity="0.55" />
      <g stroke="#c9a557" strokeWidth="0.6" fill="none" opacity="0.8">
        <path d="M8 14 Q8 8 14 8" />
        <path d="M52 14 Q52 8 46 8" />
        <path d="M8 70 Q8 76 14 76" />
        <path d="M52 70 Q52 76 46 76" />
        <path d="M10 18 Q10 10 18 10" opacity="0.45" />
        <path d="M50 18 Q50 10 42 10" opacity="0.45" />
        <path d="M10 66 Q10 74 18 74" opacity="0.45" />
        <path d="M50 66 Q50 74 42 74" opacity="0.45" />
      </g>
      <g fill="#c9a557" opacity="0.55">
        <circle cx="30" cy="12.5" r="0.9" />
        <circle cx="30" cy="71.5" r="0.9" />
        <circle cx="11.5" cy="42" r="0.9" />
        <circle cx="48.5" cy="42" r="0.9" />
      </g>
      <g stroke="#c9a557" fill="none" opacity="0.85">
        <path d="M30 30 L39 42 L30 54 L21 42 Z" strokeWidth="0.9" />
        <path d="M30 34.5 L35.7 42 L30 49.5 L24.3 42 Z" strokeWidth="0.5" opacity="0.7" />
        <circle cx="30" cy="42" r="2.4" strokeWidth="0.7" />
        <path d="M30 24.5 Q32.5 28 30 30 Q27.5 28 30 24.5 Z" strokeWidth="0.55" />
        <path d="M30 59.5 Q32.5 56 30 54 Q27.5 56 30 59.5 Z" strokeWidth="0.55" />
        <path d="M15.5 42 Q19 39.5 21 42 Q19 44.5 15.5 42 Z" strokeWidth="0.55" />
        <path d="M44.5 42 Q41 39.5 39 42 Q41 44.5 44.5 42 Z" strokeWidth="0.55" />
      </g>
      <circle cx="30" cy="42" r="1" fill="#e3c883" />
    </svg>
  );
}
