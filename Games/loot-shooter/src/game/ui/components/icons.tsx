import type { WeaponFamily } from "../../items/weapons/catalog";

const FAMILY_PATHS: Record<WeaponFamily, string> = {
  pistol: "M6 20 h30 v7 h-10 l-2 5 h-8 l1.5-5 h-5 v10 a5 5 0 0 1-6.5-4.8 Z M36 21.5 h12 v4 h-12 Z",
  smg: "M4 20 h34 v6 h-8 l-1.5 9 h-8 l1.5-9 h-6 v8 h-6 v-8 h-6 Z M38 21 h14 v4 h-14 Z M20 15 h10 v5 h-10 Z",
  shotgun: "M2 21 h44 v3.4 h-44 Z M2 26 h44 v3.4 h-44 Z M46 20 h12 v10 h-12 Z M14 30 l-4 9 h8 l3-9 Z",
  rifle: "M2 21 h40 v5.5 h-9 l-2 10 h-8 l2-10 h-11 l-3 7 h-7 l3-7 h-5 Z M42 22 h16 v3.5 h-16 Z M24 15 h12 v6 h-12 Z",
  dmr: "M2 23 h44 v4.5 h-10 l-1.5 8 h-7 l1.5-8 h-15 l-3 6 h-6 l3-6 h-6 Z M46 24 h14 v2.8 h-14 Z M20 13 a6 6 0 0 1 12 0 v4 h-4 v-4 a2.5 2.5 0 0 0-4 0 v4 h-4 Z",
  beam: "M4 21 h10 v8 h-10 Z M14 19 h6 v12 h-6 Z M22 21 h6 v8 h-6 Z M30 19 h6 v12 h-6 Z M38 22.5 h20 v5 h-20 Z M10 29 l-3 9 h8 l2.5-9 Z",
  launcher: "M2 18 h40 a7 7 0 0 1 0 14 h-40 Z M42 20 h14 v10 h-14 Z M14 32 l-4 8 h9 l3-8 Z M8 22 h8 v6 h-8 Z",
  railgun: "M2 19 h48 v3 h-48 Z M2 28 h48 v3 h-48 Z M8 22 h32 v6 h-32 Z M50 21 h10 v8 h-10 Z M14 31 l-3 8 h8 l2.5-8 Z",
};

export function WeaponIcon({ family, className }: { family: WeaponFamily; className?: string }) {
  return (
    <svg viewBox="0 0 64 48" className={className} aria-hidden="true">
      <path d={FAMILY_PATHS[family]} fill="currentColor" />
    </svg>
  );
}

export function GrenadeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path d="M24 14 a11 11 0 1 0 0 22 a11 11 0 0 0 0-22 Z" fill="currentColor" />
      <path d="M20 8 h8 v6 h-8 Z M28 6 l6-3 2 4-6 3 Z" fill="currentColor" />
      <path d="M18 22 h12 v3 h-12 Z" fill="#0a0f14" opacity="0.55" />
    </svg>
  );
}

export function MedkitIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect x="6" y="12" width="36" height="28" rx="4" fill="currentColor" />
      <rect x="18" y="8" width="12" height="6" rx="2" fill="currentColor" />
      <path d="M21 19 h6 v6 h6 v6 h-6 v6 h-6 v-6 h-6 v-6 h6 Z" fill="#0a0f14" />
    </svg>
  );
}
