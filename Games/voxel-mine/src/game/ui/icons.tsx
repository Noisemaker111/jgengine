export function CubeIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <polygon points="12,2 22,7 12,12 2,7" fill={color} />
      <polygon points="12,2 22,7 12,12 2,7" fill="#ffffff" opacity="0.3" />
      <polygon points="2,7 12,12 12,22 2,17" fill={color} />
      <polygon points="22,7 12,12 12,22 22,17" fill={color} />
      <polygon points="22,7 12,12 12,22 22,17" fill="#000000" opacity="0.28" />
    </svg>
  );
}

export function PickaxeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="100%"
      height="100%"
      fill="none"
      stroke="#e2e8f0"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6 C 9 3, 16 4, 21 9" />
      <line x1="7" y1="6.5" x2="16.5" y2="19" />
    </svg>
  );
}
