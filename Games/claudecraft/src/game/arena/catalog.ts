import { sceneMarkerXZ } from "../../editorLayers";
import type { MobDef } from "../model";

export const FIESTA_COUNTDOWN = 5;
export const FIESTA_SCORE_LIMIT = 15;
export const FIESTA_MAX_DURATION = 360;
export const FIESTA_TOTAL_WAVES = 3;
export const FIESTA_FIRST_WAVE_AT = 8;
export const FIESTA_WAVE_INTERVAL = 50;
export const FIESTA_RESPAWN_BASE = 3;
export const FIESTA_RESPAWN_PER_DEATH = 1.2;
export const FIESTA_RESPAWN_PER_MINUTE = 1.5;
export const FIESTA_RESPAWN_MAX = 14;
export const FIESTA_RING_START = 22;
export const FIESTA_RING_MIN = 6;
export const FIESTA_RING_DPS_PCT = 0.06;
export const FIESTA_RING_SHRINK_RATE = 0.6;
export const FIESTA_POWERUP_FIRST = 12;
export const FIESTA_POWERUP_INTERVAL = 16;
export const FIESTA_POWERUP_TELEGRAPH = 5;
export const FIESTA_POWERUP_TTL = 18;
export const FIESTA_POWERUP_RADIUS = 2;
export const FIESTA_POWERUP_MAX = 3;
export const ARENA_RETURN_DELAY = 5;

export const ARENA_CENTER: readonly [number, number] = sceneMarkerXZ("landmark:arena");
export const ARENA_SPAWN_A: readonly [number, number] = [ARENA_CENTER[0], ARENA_CENTER[1] - 14];
export const ARENA_SPAWN_B: readonly [number, number] = [ARENA_CENTER[0], ARENA_CENTER[1] + 18];
export const ARENA_SPAWNS_A_2V2: readonly (readonly [number, number])[] = [
  [ARENA_CENTER[0] - 7, ARENA_CENTER[1] - 14],
  [ARENA_CENTER[0] + 7, ARENA_CENTER[1] - 14],
];
export const ARENA_SPAWNS_B_2V2: readonly (readonly [number, number])[] = [
  [ARENA_CENTER[0] - 7, ARENA_CENTER[1] + 18],
  [ARENA_CENTER[0] + 7, ARENA_CENTER[1] + 18],
];

export const ARENA_PILLARS: readonly (readonly [number, number])[] = [
  [-14, -10],
  [14, -10],
  [-14, 14],
  [14, 14],
  [0, -4],
  [0, 8],
  [-9, -10],
  [9, -10],
  [-9, 14],
  [9, 14],
];
export const ARENA_STUBS: readonly (readonly [number, number])[] = [
  [-11, 2],
  [11, 2],
];
export const ARENA_DAIS: readonly [number, number, number] = [0, 2, 8];
export const ARENA_Z_MIN = -20;
export const ARENA_Z_MAX = 24;
export const ARENA_WALL_X = 23;

export type AugmentTier = "silver" | "gold" | "prismatic";

export interface AugmentDef {
  id: string;
  name: string;
  tier: AugmentTier;
  description: string;
  casterOnly?: boolean;
  physicalOnly?: boolean;
  healerOnly?: boolean;
  meleeDmgPct?: number;
  spellDmgPct?: number;
  healPct?: number;
  maxHpPct?: number;
  crit?: number;
  armor?: number;
  moveSpeedPct?: number;
  lifestealPct?: number;
  scorePerKill?: number;
}

export const AUGMENTS: readonly AugmentDef[] = [
  {
    id: "aug_brutality",
    name: "Brutality",
    tier: "silver",
    physicalOnly: true,
    description: "Your physical strikes hit 15% harder.",
    meleeDmgPct: 0.15,
  },
  {
    id: "aug_spellfire",
    name: "Grimfire",
    tier: "silver",
    casterOnly: true,
    description: "Your spells deal 15% more damage.",
    spellDmgPct: 0.15,
  },
  {
    id: "aug_toughness",
    name: "Toughness",
    tier: "silver",
    description: "Gain 12% maximum health.",
    maxHpPct: 0.12,
  },
  {
    id: "aug_keen_eye",
    name: "Keen Eye",
    tier: "silver",
    description: "Gain 8% critical strike chance.",
    crit: 8,
  },
  {
    id: "aug_fleetfoot",
    name: "Fleetfoot",
    tier: "silver",
    description: "Move 15% faster. Run them down — or run away.",
    moveSpeedPct: 0.15,
  },
  {
    id: "aug_ironhide",
    name: "Ironhide",
    tier: "silver",
    description: "Gain 250 armor.",
    armor: 250,
  },
  {
    id: "aug_mending",
    name: "Mending",
    tier: "silver",
    healerOnly: true,
    description: "Your healing is 20% more potent.",
    healPct: 0.2,
  },
  {
    id: "aug_warlords_might",
    name: "Warlord's Might",
    tier: "gold",
    physicalOnly: true,
    description: "+25% physical damage and +10% crit. Become the threat.",
    meleeDmgPct: 0.25,
    crit: 10,
  },
  {
    id: "aug_arcane_surge",
    name: "Arcane Surge",
    tier: "gold",
    casterOnly: true,
    description: "+25% spell damage and +10% crit. Light them up.",
    spellDmgPct: 0.25,
    crit: 10,
  },
  {
    id: "aug_vampirism",
    name: "Vampirism",
    tier: "gold",
    description: "Heal for 15% of all damage you deal. Sustain through chaos.",
    lifestealPct: 0.15,
  },
  {
    id: "aug_juggernaut",
    name: "Juggernaut",
    tier: "gold",
    description: "+20% maximum health and +400 armor. Immovable.",
    maxHpPct: 0.2,
    armor: 400,
  },
  {
    id: "aug_bloodhunter",
    name: "Bloodhunter",
    tier: "gold",
    description: "+18% damage of all kinds and +12% move speed.",
    meleeDmgPct: 0.18,
    spellDmgPct: 0.18,
    moveSpeedPct: 0.12,
  },
  {
    id: "aug_lightwell",
    name: "Gravelight",
    tier: "gold",
    healerOnly: true,
    description: "+30% healing and +15% maximum health. Anchor your team.",
    healPct: 0.3,
    maxHpPct: 0.15,
  },
  {
    id: "aug_bounty_hunter",
    name: "Bounty Hunter",
    tier: "gold",
    description: "Your kills are worth +1 bonus team point. Close the gap fast.",
    crit: 5,
    scorePerKill: 1,
  },
  {
    id: "aug_apex_predator",
    name: "Apex Predator",
    tier: "prismatic",
    physicalOnly: true,
    description: "+40% physical damage, +15% crit, heal for 12% of damage dealt.",
    meleeDmgPct: 0.4,
    crit: 15,
    lifestealPct: 0.12,
  },
  {
    id: "aug_archmage",
    name: "Archmage",
    tier: "prismatic",
    casterOnly: true,
    description: "+45% spell damage, +15% crit, +15% maximum health.",
    spellDmgPct: 0.45,
    crit: 15,
    maxHpPct: 0.15,
  },
  {
    id: "aug_unkillable",
    name: "Unkillable",
    tier: "prismatic",
    description: "+40% maximum health, +600 armor, heal for 10% of damage dealt.",
    maxHpPct: 0.4,
    armor: 600,
    lifestealPct: 0.1,
  },
  {
    id: "aug_overdrive",
    name: "Overdrive",
    tier: "prismatic",
    description: "+30% all damage, +20% crit, +20% move speed. FIESTA!",
    meleeDmgPct: 0.3,
    spellDmgPct: 0.3,
    crit: 20,
    moveSpeedPct: 0.2,
  },
  {
    id: "aug_avatar",
    name: "Avatar of War",
    tier: "prismatic",
    physicalOnly: true,
    description: "+25% all damage, +25% maximum health, +300 armor. Walk it down.",
    meleeDmgPct: 0.25,
    maxHpPct: 0.25,
    armor: 300,
  },
  {
    id: "aug_ascendant",
    name: "Ascendant",
    tier: "prismatic",
    healerOnly: true,
    description: "+45% healing, +25% spell damage, +20% maximum health.",
    healPct: 0.45,
    spellDmgPct: 0.25,
    maxHpPct: 0.2,
  },
];

export function augmentById(id: string): AugmentDef | null {
  return AUGMENTS.find((entry) => entry.id === id) ?? null;
}

export function tierForWave(wave: number): AugmentTier {
  if (wave <= 1) return "silver";
  if (wave === 2) return "gold";
  return "prismatic";
}

const CASTER_CLASSES = new Set(["mage", "warlock", "priest"]);
const HEALER_CLASSES = new Set(["priest", "paladin", "shaman", "druid"]);

export function eligibleAugments(
  tier: AugmentTier,
  classId: string,
  owned: readonly string[],
): AugmentDef[] {
  return AUGMENTS.filter((aug) => {
    if (aug.tier !== tier || owned.includes(aug.id)) return false;
    if (aug.casterOnly === true && !CASTER_CLASSES.has(classId)) return false;
    if (aug.physicalOnly === true && CASTER_CLASSES.has(classId)) return false;
    if (aug.healerOnly === true && !HEALER_CLASSES.has(classId)) return false;
    return true;
  });
}

export interface PowerupDef {
  id: string;
  name: string;
  color: string;
  duration: number;
  attackPower?: number;
  moveSpeedPct?: number;
}

export const POWERUPS: readonly PowerupDef[] = [
  { id: "pow_speed_demon", name: "Speed Demon", color: "#32e0ff", duration: 12, moveSpeedPct: 0.7 },
  { id: "pow_colossus", name: "Colossus", color: "#ff8a1e", duration: 14, attackPower: 120, moveSpeedPct: -0.18 },
  { id: "pow_moon_boots", name: "Moon Boots", color: "#b06bff", duration: 14, moveSpeedPct: 0.25 },
  { id: "pow_berserker", name: "Berserker", color: "#ff3535", duration: 10, attackPower: 280, moveSpeedPct: 0.2 },
];

export const FIESTA_ALLY_CATALOG = "fiesta_ally_bot";
export const FIESTA_ALLY_NAME = "Sir Botsworth";
export const FIESTA_POWERUP_OBJECT = "fiesta_powerup";
export const ARENA_PILLAR_OBJECT = "arena_pillar";
export const ARENA_WALL_OBJECT = "arena_wall";
export const ARENA_DAIS_OBJECT = "arena_dais";

export const FIESTA_ENEMY_MOBS: readonly MobDef[] = [
  {
    id: "fiesta_bot_botzo",
    name: "Botzo the Arcane",
    family: "humanoid",
    zone: "vale",
    minLevel: 20,
    maxLevel: 20,
    hpBase: 110,
    hpPerLevel: 19,
    dmgBase: 7,
    dmgPerLevel: 1.5,
    attackSpeed: 2.1,
    armorPerLevel: 14,
    moveSpeed: 7,
    aggroRadius: 60,
    count: 0,
    drops: [],
    abilities: [
      { id: "bot_blastwave", name: "Blastwave", intervalSec: 11, amount: 34, radius: 6, school: "fire" },
    ],
  },
  {
    id: "fiesta_bot_sneakbot",
    name: "Sneakbot",
    family: "humanoid",
    zone: "vale",
    minLevel: 20,
    maxLevel: 20,
    hpBase: 125,
    hpPerLevel: 21,
    dmgBase: 8,
    dmgPerLevel: 1.7,
    attackSpeed: 1.5,
    armorPerLevel: 22,
    moveSpeed: 8,
    aggroRadius: 60,
    count: 0,
    drops: [],
  },
];

export function fiestaEnemyById(id: string): MobDef | null {
  return FIESTA_ENEMY_MOBS.find((def) => def.id === id) ?? null;
}

export function fiestaRespawnTime(deaths: number, elapsed: number): number {
  const raw =
    FIESTA_RESPAWN_BASE +
    Math.max(0, deaths - 1) * FIESTA_RESPAWN_PER_DEATH +
    Math.floor(elapsed / 60) * FIESTA_RESPAWN_PER_MINUTE;
  return Math.min(FIESTA_RESPAWN_MAX, raw);
}

export function ringTargetForWave(wave: number): number {
  return FIESTA_RING_START - ((FIESTA_RING_START - FIESTA_RING_MIN) * wave) / FIESTA_TOTAL_WAVES;
}
