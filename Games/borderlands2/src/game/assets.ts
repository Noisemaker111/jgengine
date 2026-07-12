import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { EntitySpriteConfig } from "@jgengine/core/game/playableGame";
import { enemies, type EnemyDef } from "./entities/enemies/catalog";

export const assets = createAssetCatalog();

function billboard(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${svg}</svg>`)}`;
}

const OUTLINE = "#141210";

function psychoShape(body: string, accent: string): string {
  return `
    <ellipse cx="32" cy="59" rx="12" ry="3" fill="#000" opacity="0.35"/>
    <rect x="26" y="30" width="12" height="22" rx="3" fill="${body}" stroke="${OUTLINE}" stroke-width="2"/>
    <rect x="14" y="30" width="12" height="4" rx="2" fill="${body}" stroke="${OUTLINE}" stroke-width="1.6" transform="rotate(-32 20 32)"/>
    <rect x="38" y="28" width="14" height="4" rx="2" fill="${accent}" stroke="${OUTLINE}" stroke-width="1.6" transform="rotate(38 45 30)"/>
    <path d="M50 18 L58 26 L54 28 Z" fill="#c8c8c8" stroke="${OUTLINE}" stroke-width="1.4"/>
    <circle cx="32" cy="20" r="9" fill="#e8e4da" stroke="${OUTLINE}" stroke-width="2"/>
    <circle cx="29" cy="18" r="2.4" fill="${OUTLINE}"/>
    <circle cx="36" cy="18" r="2.4" fill="${OUTLINE}"/>
    <path d="M26 25 Q32 29 38 25" stroke="${accent}" stroke-width="2.4" fill="none"/>
    <path d="M25 12 L28 8 M32 11 L32 6 M39 12 L36 8" stroke="${accent}" stroke-width="2.2"/>
  `;
}

function marauderShape(body: string, accent: string): string {
  return `
    <ellipse cx="32" cy="59" rx="12" ry="3" fill="#000" opacity="0.35"/>
    <rect x="25" y="28" width="14" height="24" rx="3" fill="${body}" stroke="${OUTLINE}" stroke-width="2"/>
    <rect x="20" y="34" width="26" height="4" rx="2" fill="#5b544a" stroke="${OUTLINE}" stroke-width="1.6"/>
    <rect x="40" y="31" width="16" height="3.4" rx="1.6" fill="#3d3a34" stroke="${OUTLINE}" stroke-width="1.4"/>
    <circle cx="32" cy="18" r="8.6" fill="${accent}" stroke="${OUTLINE}" stroke-width="2"/>
    <rect x="25" y="15" width="14" height="5" rx="2" fill="#20242c" stroke="${OUTLINE}" stroke-width="1.2"/>
    <circle cx="29" cy="17.5" r="1.6" fill="#ffb400"/>
    <circle cx="35" cy="17.5" r="1.6" fill="#ffb400"/>
  `;
}

function nomadShape(body: string, accent: string): string {
  return `
    <ellipse cx="32" cy="60" rx="15" ry="3" fill="#000" opacity="0.35"/>
    <rect x="21" y="24" width="22" height="30" rx="4" fill="${body}" stroke="${OUTLINE}" stroke-width="2.2"/>
    <rect x="16" y="26" width="10" height="22" rx="3" fill="#6b6257" stroke="${OUTLINE}" stroke-width="1.8"/>
    <rect x="42" y="28" width="16" height="4" rx="2" fill="#3d3a34" stroke="${OUTLINE}" stroke-width="1.4"/>
    <circle cx="32" cy="15" r="8" fill="${accent}" stroke="${OUTLINE}" stroke-width="2"/>
    <rect x="26" y="12" width="12" height="4" rx="1.6" fill="#20242c"/>
    <path d="M24 22 h16" stroke="${OUTLINE}" stroke-width="2"/>
  `;
}

function skagShape(body: string, accent: string): string {
  return `
    <ellipse cx="32" cy="58" rx="17" ry="3.4" fill="#000" opacity="0.35"/>
    <path d="M10 44 Q14 28 32 26 Q52 26 56 42 Q54 52 44 54 L20 54 Q12 52 10 44 Z" fill="${body}" stroke="${OUTLINE}" stroke-width="2.2"/>
    <path d="M20 30 Q26 18 34 26 Q30 32 24 32 Z" fill="${accent}" stroke="${OUTLINE}" stroke-width="1.6"/>
    <path d="M46 36 L60 32 L58 40 L48 44 Z" fill="${accent}" stroke="${OUTLINE}" stroke-width="1.8"/>
    <path d="M50 38 L56 36 M50 42 L55 41" stroke="#efe7d8" stroke-width="2"/>
    <circle cx="47" cy="34" r="2" fill="#ffb400"/>
    <rect x="18" y="52" width="6" height="6" fill="${body}" stroke="${OUTLINE}" stroke-width="1.4"/>
    <rect x="40" y="52" width="6" height="6" fill="${body}" stroke="${OUTLINE}" stroke-width="1.4"/>
    <path d="M14 40 h8 M16 46 h8" stroke="${OUTLINE}" stroke-width="1.6" opacity="0.6"/>
  `;
}

function flyntShape(body: string, accent: string): string {
  return `
    <ellipse cx="32" cy="61" rx="18" ry="3" fill="#000" opacity="0.4"/>
    <rect x="20" y="22" width="24" height="32" rx="4" fill="${body}" stroke="${OUTLINE}" stroke-width="2.4"/>
    <path d="M20 22 L14 10 L24 16 Z" fill="${accent}" stroke="${OUTLINE}" stroke-width="1.6"/>
    <path d="M44 22 L50 10 L40 16 Z" fill="${accent}" stroke="${OUTLINE}" stroke-width="1.6"/>
    <circle cx="32" cy="14" r="9" fill="#dcd3c2" stroke="${OUTLINE}" stroke-width="2.2"/>
    <path d="M25 11 h6 v4 h-6 Z" fill="${OUTLINE}"/>
    <circle cx="37" cy="13" r="2.2" fill="${accent}"/>
    <path d="M26 20 Q32 24 38 20" stroke="${OUTLINE}" stroke-width="2" fill="none"/>
    <rect x="44" y="30" width="16" height="5" rx="2" fill="#3d3a34" stroke="${OUTLINE}" stroke-width="1.6"/>
    <path d="M46 26 q4 -6 8 0" stroke="${accent}" stroke-width="2.4" fill="none"/>
    <path d="M22 34 h20 M22 42 h20" stroke="${OUTLINE}" stroke-width="1.6" opacity="0.5"/>
  `;
}

function claptrapShape(): string {
  return `
    <ellipse cx="32" cy="59" rx="11" ry="3" fill="#000" opacity="0.35"/>
    <rect x="20" y="16" width="24" height="30" rx="5" fill="#c9a23a" stroke="${OUTLINE}" stroke-width="2.4"/>
    <circle cx="32" cy="26" r="6" fill="#20242c" stroke="${OUTLINE}" stroke-width="1.6"/>
    <circle cx="32" cy="26" r="2.6" fill="#3fc9ff"/>
    <rect x="24" y="38" width="16" height="3" rx="1.5" fill="#20242c"/>
    <circle cx="32" cy="52" r="7" fill="#4a4a4a" stroke="${OUTLINE}" stroke-width="2"/>
    <rect x="12" y="26" width="8" height="3" rx="1.5" fill="#a8842c" stroke="${OUTLINE}" stroke-width="1.2"/>
    <rect x="44" y="26" width="8" height="3" rx="1.5" fill="#a8842c" stroke="${OUTLINE}" stroke-width="1.2"/>
  `;
}

const FAMILY_COLORS: Record<string, { body: string; accent: string }> = {
  psycho: { body: "#c96f3b", accent: "#e23c2e" },
  marauder: { body: "#6f5a3e", accent: "#8a4a2e" },
  nomad: { body: "#7a6a4a", accent: "#4e4436" },
  skag_pup: { body: "#b09a72", accent: "#7d6844" },
  skag: { body: "#9a8258", accent: "#6b5636" },
  badass_skag: { body: "#7d6844", accent: "#a33c28" },
  badass_psycho: { body: "#a34a2c", accent: "#ffb400" },
  captain_flynt: { body: "#5a4a66", accent: "#ff7a1a" },
};

function shapeFor(def: EnemyDef, colors: { body: string; accent: string }): string {
  if (def.id === "captain_flynt") return flyntShape(colors.body, colors.accent);
  if (def.family === "skag") return skagShape(colors.body, colors.accent);
  if (def.id === "psycho" || def.id === "badass_psycho") return psychoShape(colors.body, colors.accent);
  if (def.id === "nomad") return nomadShape(colors.body, colors.accent);
  return marauderShape(colors.body, colors.accent);
}

function badassHalo(def: EnemyDef): string {
  if (!def.badass) return "";
  return `<circle cx="32" cy="33" r="29" fill="none" stroke="#ffb400" stroke-width="2.4" opacity="0.8"/>`;
}

function spriteFor(def: EnemyDef): EntitySpriteConfig {
  const colors = FAMILY_COLORS[def.id] ?? FAMILY_COLORS.psycho!;
  const height = (def.family === "skag" ? 1.2 : 1.8) * def.scale;
  const width = (def.family === "skag" ? 1.7 : 1.4) * def.scale;
  return {
    url: billboard(badassHalo(def) + shapeFor(def, colors)),
    width,
    height,
    y: height / 2,
  };
}

export const entitySprites: Record<string, EntitySpriteConfig> = {
  ...Object.fromEntries(enemies.map((def) => [def.id, spriteFor(def)])),
  claptrap: { url: billboard(claptrapShape()), width: 1.1, height: 1.4, y: 0.7 },
};
