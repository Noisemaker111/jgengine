export function GunIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 40" className={className} aria-hidden="true">
      <path
        d="M4 12 h40 v6 h-6 l-2 8 h-8 l1 -8 h-6 v10 a6 6 0 0 1 -12 0 v-4 h-3 v-6 h3 z"
        fill="currentColor"
      />
      <rect x="44" y="10" width="16" height="5" rx="1.5" fill="currentColor" />
      <rect x="10" y="20" width="8" height="3" rx="1" fill="#0f172a" opacity="0.5" />
    </svg>
  );
}
