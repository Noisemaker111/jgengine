import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { EntitySpriteConfig } from "@jgengine/core/game/playableGame";

export const assets = createAssetCatalog();

function billboard(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const OUTRIDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <ellipse cx="32" cy="58" rx="16" ry="4" fill="#000" opacity="0.35"/>
  <path d="M32 6c-7 0-11 6-11 13 0 5 2 9 5 12l-9 5c-4 2-6 6-6 10v10h42V46c0-4-2-8-6-10l-9-5c3-3 5-7 5-12 0-7-4-13-11-13z" fill="#dfe9ea"/>
  <path d="M21 46l11-8 11 8v10H21z" fill="#2fb7c4"/>
  <circle cx="27" cy="22" r="3" fill="#123"/>
  <circle cx="37" cy="22" r="3" fill="#123"/>
  <rect x="29" y="2" width="6" height="8" rx="2" fill="#2fb7c4"/>
  <circle cx="32" cy="2" r="3" fill="#8be9f0"/>
</svg>`;

const SKITTERLING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <ellipse cx="32" cy="56" rx="14" ry="4" fill="#000" opacity="0.35"/>
  <polygon points="32,10 44,34 38,52 26,52 20,34" fill="#8be36b"/>
  <polygon points="32,10 20,34 8,28" fill="#5aa23c"/>
  <polygon points="32,10 44,34 56,28" fill="#5aa23c"/>
  <circle cx="27" cy="30" r="2.4" fill="#0e2a0a"/>
  <circle cx="37" cy="30" r="2.4" fill="#0e2a0a"/>
</svg>`;

const HUSK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <ellipse cx="32" cy="58" rx="16" ry="4" fill="#000" opacity="0.35"/>
  <path d="M32 12c-11 0-18 9-18 20s7 20 18 20 18-9 18-20-7-20-18-20z" fill="#4fae5c"/>
  <polygon points="18,18 24,4 28,20" fill="#2f7d38"/>
  <polygon points="46,18 40,4 36,20" fill="#2f7d38"/>
  <circle cx="25" cy="34" r="3" fill="#0e2a0a"/>
  <circle cx="39" cy="34" r="3" fill="#0e2a0a"/>
  <path d="M23 44q9 6 18 0" stroke="#0e2a0a" stroke-width="2" fill="none"/>
</svg>`;

const BLOATLING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <ellipse cx="32" cy="58" rx="20" ry="4" fill="#000" opacity="0.35"/>
  <circle cx="32" cy="34" r="24" fill="#2f7d55"/>
  <circle cx="20" cy="26" r="4" fill="#1c5138"/>
  <circle cx="44" cy="40" r="5" fill="#1c5138"/>
  <circle cx="38" cy="20" r="3" fill="#1c5138"/>
  <circle cx="24" cy="32" r="3.4" fill="#0a1f14"/>
  <circle cx="40" cy="32" r="3.4" fill="#0a1f14"/>
</svg>`;

const WARDEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <ellipse cx="32" cy="60" rx="22" ry="4" fill="#000" opacity="0.4"/>
  <polygon points="32,2 50,20 44,60 20,60 14,20" fill="#175c46"/>
  <polygon points="32,2 14,20 6,14" fill="#0c3527"/>
  <polygon points="32,2 50,20 58,14" fill="#0c3527"/>
  <circle cx="32" cy="26" r="6" fill="#ff5c5c"/>
  <circle cx="32" cy="26" r="2.4" fill="#ffd9d9"/>
</svg>`;

const XP_GEM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <polygon points="16,2 28,14 16,30 4,14" fill="#a566d9"/>
  <polygon points="16,2 28,14 16,17 4,14" fill="#c99bef"/>
</svg>`;

export const XP_GEM_ICON_URL = billboard(XP_GEM_SVG);

export const entitySprites: Record<string, EntitySpriteConfig> = {
  outrider: { url: billboard(OUTRIDER_SVG), width: 1.5, height: 1.9, y: 0.95 },
  skitterling: { url: billboard(SKITTERLING_SVG), width: 0.9, height: 0.9, y: 0.45 },
  husk: { url: billboard(HUSK_SVG), width: 1.3, height: 1.3, y: 0.65 },
  bloatling: { url: billboard(BLOATLING_SVG), width: 1.7, height: 1.7, y: 0.85 },
  warden: { url: billboard(WARDEN_SVG), width: 2.4, height: 2.6, y: 1.3 },
};
