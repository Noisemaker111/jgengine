import type { EntitySpriteConfig } from "@jgengine/core/game/playableGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { CLASS_ENTITY_ID } from "./model";
import { MOBS } from "./entities/enemies/catalog";
import { NPCS } from "./entities/npcs/catalog";

export const assets = createAssetCatalog();

function billboard(body: string, accent: string, outline: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body
    .replaceAll("BODY", outline)
    .replaceAll("ACCENT", accent)}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const SHAPES = {
  wolf: '<path fill="BODY" d="M6 44 L14 34 L16 24 L22 18 L26 24 L44 26 L54 20 L58 26 L50 32 L52 44 L46 44 L44 36 L24 36 L20 44 Z"/><circle cx="22" cy="24" r="2" fill="ACCENT"/><path fill="BODY" d="M50 32 L60 40 L54 42 Z"/>',
  boar: '<ellipse cx="32" cy="36" rx="22" ry="14" fill="BODY"/><path fill="BODY" d="M8 34 L2 28 L10 26 Z"/><path fill="ACCENT" d="M12 40 L4 44 L10 36 Z"/><circle cx="14" cy="32" r="2" fill="ACCENT"/><rect x="18" y="48" width="5" height="8" fill="BODY"/><rect x="40" y="48" width="5" height="8" fill="BODY"/>',
  spider: '<ellipse cx="32" cy="34" rx="12" ry="10" fill="BODY"/><circle cx="32" cy="22" r="6" fill="BODY"/><circle cx="30" cy="20" r="1.5" fill="ACCENT"/><circle cx="34" cy="20" r="1.5" fill="ACCENT"/><path stroke="BODY" stroke-width="3" fill="none" d="M22 30 L8 20 M22 36 L6 34 M22 42 L8 50 M24 46 L14 58 M42 30 L56 20 M42 36 L58 34 M42 42 L56 50 M40 46 L50 58"/>',
  murloc: '<path fill="BODY" d="M32 8 L40 20 L38 26 L44 40 L40 56 L24 56 L20 40 L26 26 L24 20 Z"/><path fill="ACCENT" d="M32 8 L36 2 L38 12 Z M28 22 a4 4 0 1 0 8 0"/><circle cx="28" cy="22" r="2.5" fill="ACCENT"/><circle cx="36" cy="22" r="2.5" fill="ACCENT"/>',
  bandit: '<circle cx="32" cy="16" r="8" fill="BODY"/><path fill="ACCENT" d="M24 16 h16 v3 h-16 Z"/><path fill="BODY" d="M22 26 h20 l4 22 h-8 l-2 -12 h-8 l-2 12 h-8 Z"/><path fill="ACCENT" d="M44 30 L58 22 L56 28 L46 34 Z"/><rect x="26" y="48" width="5" height="10" fill="BODY"/><rect x="33" y="48" width="5" height="10" fill="BODY"/>',
  cultist: '<path fill="BODY" d="M32 6 L44 20 L42 58 L22 58 L20 20 Z"/><path fill="ACCENT" d="M26 20 a6 6 0 0 0 12 0 L32 12 Z"/><circle cx="32" cy="34" r="4" fill="ACCENT"/>',
  skeleton: '<circle cx="32" cy="14" r="9" fill="BODY"/><rect x="27" y="12" width="3" height="4" fill="ACCENT"/><rect x="34" y="12" width="3" height="4" fill="ACCENT"/><rect x="30" y="24" width="4" height="18" fill="BODY"/><path stroke="BODY" stroke-width="3" fill="none" d="M24 28 h16 M24 34 h16 M24 40 h16"/><rect x="26" y="44" width="4" height="14" fill="BODY"/><rect x="34" y="44" width="4" height="14" fill="BODY"/>',
  ghost: '<path fill="BODY" opacity="0.85" d="M32 6 C44 6 48 18 48 28 L48 50 L42 44 L38 52 L32 46 L26 52 L22 44 L16 50 L16 28 C16 18 20 6 32 6 Z"/><circle cx="26" cy="24" r="3" fill="ACCENT"/><circle cx="38" cy="24" r="3" fill="ACCENT"/>',
  brute: '<path fill="BODY" d="M20 14 L44 14 L52 30 L48 58 L16 58 L12 30 Z"/><circle cx="32" cy="12" r="8" fill="BODY"/><path fill="ACCENT" d="M26 10 L22 2 L28 6 Z M38 10 L42 2 L36 6 Z"/><circle cx="28" cy="12" r="2" fill="ACCENT"/><circle cx="36" cy="12" r="2" fill="ACCENT"/><rect x="4" y="26" width="10" height="6" fill="BODY"/><rect x="50" y="26" width="10" height="6" fill="BODY"/>',
  kobold: '<circle cx="32" cy="20" r="8" fill="BODY"/><path fill="ACCENT" d="M24 16 L18 8 L26 12 Z M40 16 L46 8 L38 12 Z"/><path fill="BODY" d="M24 28 h16 l2 18 h-20 Z"/><path fill="ACCENT" d="M42 32 L56 24 L58 28 L44 36 Z"/><rect x="26" y="46" width="4" height="10" fill="BODY"/><rect x="34" y="46" width="4" height="10" fill="BODY"/>',
  elemental: '<path fill="BODY" d="M32 4 L46 24 L40 34 L48 44 L32 60 L16 44 L24 34 L18 24 Z"/><path fill="ACCENT" d="M32 16 L38 26 L32 36 L26 26 Z"/>',
  rat: '<ellipse cx="30" cy="40" rx="16" ry="9" fill="BODY"/><circle cx="14" cy="36" r="6" fill="BODY"/><path fill="ACCENT" d="M12 30 L8 24 L14 28 Z M18 30 L16 22 L22 28 Z"/><path stroke="BODY" stroke-width="3" fill="none" d="M46 40 C56 40 58 32 54 28"/><circle cx="12" cy="35" r="1.5" fill="ACCENT"/>',
  boss: '<path fill="BODY" d="M32 6 L40 14 L52 10 L48 24 L54 40 L44 38 L42 58 L22 58 L20 38 L10 40 L16 24 L12 10 L24 14 Z"/><circle cx="26" cy="22" r="3" fill="ACCENT"/><circle cx="38" cy="22" r="3" fill="ACCENT"/><path fill="ACCENT" d="M26 34 h12 l-6 8 Z"/>',
  hero: '<circle cx="32" cy="12" r="8" fill="BODY"/><path fill="BODY" d="M22 22 h20 l3 20 h-7 l-1 -10 h-10 l-1 10 h-7 Z"/><path fill="ACCENT" d="M46 18 L50 4 L54 18 L50 30 Z"/><path fill="ACCENT" d="M10 24 a8 8 0 0 1 8 12 a10 10 0 0 1 -8 -12 Z"/><rect x="26" y="42" width="5" height="14" fill="BODY"/><rect x="33" y="42" width="5" height="14" fill="BODY"/>',
  guard: '<circle cx="32" cy="14" r="8" fill="BODY"/><path fill="ACCENT" d="M24 10 h16 l-2 -6 h-12 Z"/><path fill="BODY" d="M22 24 h20 l2 20 h-24 Z"/><rect x="50" y="4" width="4" height="40" fill="ACCENT"/><path fill="ACCENT" d="M48 4 L56 4 L52 -2 Z"/><rect x="26" y="44" width="5" height="12" fill="BODY"/><rect x="33" y="44" width="5" height="12" fill="BODY"/>',
  vendor: '<circle cx="32" cy="14" r="8" fill="BODY"/><path fill="BODY" d="M20 24 h24 l4 22 h-32 Z"/><path fill="ACCENT" d="M26 34 a6 8 0 1 0 12 0 a6 8 0 1 0 -12 0 Z M30 30 h4 v-4 h-4 Z"/><rect x="26" y="46" width="5" height="10" fill="BODY"/><rect x="33" y="46" width="5" height="10" fill="BODY"/>',
} as const;

type ShapeKey = keyof typeof SHAPES;

function familyShape(mobId: string, family: string): ShapeKey {
  if (/spider|widow/.test(mobId)) return "spider";
  if (/boar/.test(mobId)) return "boar";
  if (/rat/.test(mobId)) return "rat";
  if (/murloc|mudfin|deepfen|bloat/.test(mobId)) return "murloc";
  if (/troll|ogre/.test(mobId)) return "brute";
  if (/kobold|sapper/.test(mobId)) return "kobold";
  if (/elemental|storm/.test(mobId)) return "elemental";
  if (/cultist|acolyte|necromancer|zealot/.test(mobId)) return "cultist";
  if (/ghost|drowned|shambler/.test(mobId)) return "ghost";
  if (/bones|marrow|crypt/.test(mobId)) return "skeleton";
  if (/bandit/.test(mobId)) return "bandit";
  if (family === "undead") return "skeleton";
  if (family === "elemental") return "elemental";
  if (family === "humanoid") return "bandit";
  if (family === "demon") return "boss";
  return "wolf";
}

const FAMILY_TINTS: Record<string, string> = {
  beast: "#c9873b",
  humanoid: "#d0b46a",
  undead: "#9fd6c8",
  elemental: "#7fc4f0",
  demon: "#e06a5a",
};

export const entitySprites: Record<string, EntitySpriteConfig> = {
  [CLASS_ENTITY_ID]: {
    url: billboard(SHAPES.hero, "#e8c15a", "#2e3440"),
    width: 1.7,
    height: 1.9,
    y: 1.0,
  },
};

for (const mob of MOBS) {
  const shape = mob.boss === true ? "boss" : familyShape(mob.id, mob.family);
  const accent = FAMILY_TINTS[mob.family] ?? "#d0b46a";
  const size = mob.boss === true ? 3.4 : mob.rare === true ? 2.4 : 1.8;
  entitySprites[mob.id] = {
    url: billboard(SHAPES[shape], accent, mob.boss === true ? "#3a1f2e" : "#31363f"),
    width: size,
    height: size,
    y: size / 2 + 0.05,
  };
}

for (const npc of NPCS) {
  entitySprites[npc.id] = {
    url: billboard(
      npc.kind === "vendor" ? SHAPES.vendor : SHAPES.guard,
      npc.kind === "vendor" ? "#e8c15a" : "#8fb4e0",
      "#3d3a34",
    ),
    width: 1.7,
    height: 1.9,
    y: 1.0,
  };
}
