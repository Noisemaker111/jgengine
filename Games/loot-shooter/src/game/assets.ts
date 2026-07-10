import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { EntitySpriteConfig } from "@jgengine/core/game/playableGame";
import { enemies, type EnemyDef } from "./entities/enemies/catalog";
import { FAMILY_TINTS, RANK_ACCENTS } from "./palette";

export const assets = createAssetCatalog();

function billboard(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${svg}</svg>`)}`;
}

const FAMILY_SHAPES: Record<string, (body: string, accent: string, rank: string) => string> = {
  drone: (body, accent, rank) => `
    <ellipse cx="32" cy="58" rx="14" ry="3.5" fill="#000" opacity="0.35"/>
    <rect x="8" y="22" width="20" height="3" rx="1.5" fill="${accent}" transform="rotate(-18 18 23)"/>
    <rect x="36" y="22" width="20" height="3" rx="1.5" fill="${accent}" transform="rotate(18 46 23)"/>
    <circle cx="12" cy="19" r="4" fill="${body}" opacity="0.7"/>
    <circle cx="52" cy="19" r="4" fill="${body}" opacity="0.7"/>
    <path d="M32 14 C44 14 50 24 50 34 C50 46 42 54 32 54 C22 54 14 46 14 34 C14 24 20 14 32 14 Z" fill="${body}"/>
    <circle cx="32" cy="32" r="7" fill="#0a0f0a"/>
    <circle cx="32" cy="32" r="4" fill="${rank}"/>
    <path d="M24 48 L32 44 L40 48 L32 52 Z" fill="${accent}"/>
  `,
  skitter: (body, accent, rank) => `
    <ellipse cx="32" cy="58" rx="15" ry="3.5" fill="#000" opacity="0.35"/>
    <path stroke="${accent}" stroke-width="3" fill="none" d="M20 34 L6 26 M20 40 L4 40 M22 46 L8 54 M44 34 L58 26 M44 40 L60 40 M42 46 L56 54"/>
    <path d="M32 8 L44 22 L42 44 L32 54 L22 44 L20 22 Z" fill="${body}"/>
    <path d="M32 8 L38 20 L32 30 L26 20 Z" fill="${accent}"/>
    <circle cx="27" cy="30" r="2.6" fill="${rank}"/>
    <circle cx="37" cy="30" r="2.6" fill="${rank}"/>
    <path d="M26 40 L32 44 L38 40" stroke="#0a0705" stroke-width="2" fill="none"/>
  `,
  husk: (body, accent, rank) => `
    <ellipse cx="32" cy="59" rx="17" ry="3.5" fill="#000" opacity="0.35"/>
    <path d="M18 12 L46 12 L54 28 L50 58 L14 58 L10 28 Z" fill="${body}"/>
    <path d="M18 12 L46 12 L44 22 L20 22 Z" fill="${accent}"/>
    <rect x="6" y="26" width="9" height="7" rx="2" fill="${body}"/>
    <rect x="49" y="26" width="9" height="7" rx="2" fill="${body}"/>
    <circle cx="26" cy="18" r="2.6" fill="${rank}"/>
    <circle cx="38" cy="18" r="2.6" fill="${rank}"/>
    <path d="M22 34 h20 v4 h-20 Z M24 42 h16 v4 h-16 Z" fill="${accent}" opacity="0.8"/>
  `,
  spitter: (body, accent, rank) => `
    <ellipse cx="32" cy="59" rx="13" ry="3.5" fill="#000" opacity="0.35"/>
    <path d="M32 4 C40 10 42 18 40 26 L44 40 C44 52 38 58 32 58 C26 58 20 52 20 40 L24 26 C22 18 24 10 32 4 Z" fill="${body}"/>
    <ellipse cx="32" cy="40" rx="9" ry="11" fill="${accent}"/>
    <circle cx="32" cy="40" r="5" fill="${rank}" opacity="0.9"/>
    <circle cx="27" cy="16" r="2.4" fill="${rank}"/>
    <circle cx="37" cy="16" r="2.4" fill="${rank}"/>
    <path d="M28 24 L32 28 L36 24" stroke="#0a0705" stroke-width="2" fill="none"/>
  `,
  boss: (body, accent, rank) => `
    <ellipse cx="32" cy="60" rx="20" ry="3.5" fill="#000" opacity="0.4"/>
    <path d="M32 2 L42 8 L54 6 L50 20 L58 36 L46 36 L44 58 L20 58 L18 36 L6 36 L14 20 L10 6 L22 8 Z" fill="${body}"/>
    <path d="M32 2 L42 8 L38 16 L26 16 L22 8 Z" fill="${accent}"/>
    <circle cx="25" cy="24" r="3.4" fill="${rank}"/>
    <circle cx="39" cy="24" r="3.4" fill="${rank}"/>
    <path d="M24 38 h16 l-8 10 Z" fill="${accent}"/>
    <rect x="14" y="44" width="8" height="4" fill="${accent}" opacity="0.7"/>
    <rect x="42" y="44" width="8" height="4" fill="${accent}" opacity="0.7"/>
  `,
};

function rankHalo(rank: EnemyDef["rank"], color: string): string {
  if (rank === "grunt") return "";
  const inner = `<circle cx="32" cy="33" r="29" fill="none" stroke="${color}" stroke-width="2" opacity="0.75"/>`;
  if (rank === "veteran") return inner;
  return `${inner}<circle cx="32" cy="33" r="26" fill="none" stroke="${color}" stroke-width="1.2" opacity="0.5"/>`;
}

function spriteFor(def: EnemyDef): EntitySpriteConfig {
  const tint = FAMILY_TINTS[def.family];
  const rankColor = RANK_ACCENTS[def.rank];
  const shape = FAMILY_SHAPES[def.family] ?? FAMILY_SHAPES.drone!;
  const width = 1.5 * def.scale;
  const height = 1.7 * def.scale;
  return {
    url: billboard(rankHalo(def.rank, rankColor) + shape(tint.body, tint.accent, rankColor)),
    width,
    height,
    y: height / 2,
  };
}

export const entitySprites: Record<string, EntitySpriteConfig> = Object.fromEntries(
  enemies.map((def) => [def.id, spriteFor(def)]),
);
