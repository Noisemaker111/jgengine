import type { ReactNode } from "react";

import type { CardArt } from "../cards";
import type { IntentKind } from "../enemy";

function Glyph({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      {children}
    </svg>
  );
}

const ART_PATHS: Record<CardArt, ReactNode> = {
  sword: (
    <>
      <path d="M20.5 2.5l-8.7 8.7 1.6 1.6 8.7-8.7-.4-1.2z" />
      <path d="M11 12l-1.6-1.6-5.9 5.9a2 2 0 000 2.8l.4.4a2 2 0 002.8 0L12.6 13.6 11 12z" />
      <path d="M6 18l-2 2M14 15l3 3 2-2-3-3" />
    </>
  ),
  shield: <path d="M12 2l8 3v6c0 5-3.4 8.7-8 11-4.6-2.3-8-6-8-11V5l8-3z" />,
  mace: (
    <>
      <path d="M4 20l7-7-1.4-1.4-7 7z" />
      <path d="M16 3a5 5 0 100 10 5 5 0 000-10zm0 2.2l1 1.8 2-.4-1 1.8 1 1.8-2-.4-1 1.8-1-1.8-2 .4 1-1.8-1-1.8 2 .4z" />
    </>
  ),
  dagger: (
    <>
      <path d="M13 2l3 3-8 8-3-1 1-3z" />
      <path d="M8 13l3 3-4 4-3-3z" />
      <path d="M15 6l6 6-1.5 1.5-6-6z" />
    </>
  ),
  flame: <path d="M12 2c1 4 5 5 5 9a5 5 0 01-10 0c0-2 1-3 2-4 .3 1.5 1.2 2 2 2 0-2-2-3-1-7z" />,
  brace: (
    <>
      <path d="M3 8l9 4 9-4-9-4z" />
      <path d="M3 12l9 4 9-4M3 16l9 4 9-4" />
    </>
  ),
  wave: (
    <>
      <path d="M2 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0v2c-2-2-4-2-6 0s-4 2-6 0-4-2-6 0z" />
      <path d="M2 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0v2c-2-2-4-2-6 0s-4 2-6 0-4-2-6 0z" />
    </>
  ),
  axe: (
    <>
      <path d="M14 2c4 0 7 3 7 6 0 2-1 3-3 4l-3-1 1-4-4-1c1-2 3-3 5-3z" />
      <path d="M11 8l-8 8 2 2 8-8z" />
    </>
  ),
};

export function CardArtIcon({ art, className }: { art: CardArt; className?: string }) {
  return <Glyph className={className}>{ART_PATHS[art]}</Glyph>;
}

const INTENT_PATHS: Record<IntentKind, ReactNode> = {
  attack: (
    <>
      <path d="M20.5 2.5l-8.7 8.7 1.6 1.6 8.7-8.7z" />
      <path d="M11 12l-1.6-1.6-6 6a2 2 0 102.8 2.8l6-6z" />
      <path d="M3.5 2.5l8.7 8.7-1.6 1.6-8.7-8.7z" opacity="0.55" />
    </>
  ),
  defend: <path d="M12 2l8 3v6c0 5-3.4 8.7-8 11-4.6-2.3-8-6-8-11V5l8-3z" />,
  buff: (
    <>
      <path d="M12 3l6 7h-4v11h-4V10H6z" />
    </>
  ),
  debuff: (
    <>
      <path d="M12 2l8 3v6c0 5-3.4 8.7-8 11-4.6-2.3-8-6-8-11V5l8-3z" opacity="0.3" />
      <path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </>
  ),
};

export function IntentIcon({ kind, className }: { kind: IntentKind; className?: string }) {
  return <Glyph className={className}>{INTENT_PATHS[kind]}</Glyph>;
}

export type StatusEffectKind = "weak" | "vulnerable";

const STATUS_PATHS: Record<StatusEffectKind, ReactNode> = {
  weak: (
    <>
      <path d="M20.5 2.5l-8.7 8.7 1.6 1.6 8.7-8.7-.4-1.2z" opacity="0.4" />
      <path d="M11 12l-1.6-1.6-5.9 5.9a2 2 0 000 2.8l.4.4a2 2 0 002.8 0L12.6 13.6 11 12z" opacity="0.4" />
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" fill="none" />
    </>
  ),
  vulnerable: (
    <>
      <path d="M12 2l8 3v6c0 5-3.4 8.7-8 11-4.6-2.3-8-6-8-11V5l8-3z" opacity="0.35" />
      <path d="M12 7v6M12 16v1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </>
  ),
};

export function StatusIcon({ kind, className }: { kind: StatusEffectKind; className?: string }) {
  return <Glyph className={className}>{STATUS_PATHS[kind]}</Glyph>;
}
