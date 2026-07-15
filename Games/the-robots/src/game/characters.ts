import { createTalentTree, type TalentNodeDef, type TalentTree } from "@jgengine/core/game/talents";

export type BonusStat =
  | "gunDamage"
  | "fireRate"
  | "reloadSpeed"
  | "magSize"
  | "critChance"
  | "critDamage"
  | "elementChance"
  | "dotDamage"
  | "maxHealth"
  | "shieldRegen"
  | "shieldDelay"
  | "moveSpeed"
  | "ffylTime"
  | "secondWindHeal"
  | "ammoRefund"
  | "grenadeDamage";

export interface CharacterBranch {
  id: string;
  name: string;
  flavor: string;
}

export interface CharacterDef {
  id: string;
  name: string;
  className: string;
  tagline: string;
  color: string;
  branches: readonly [CharacterBranch, CharacterBranch, CharacterBranch];
  nodes: readonly TalentNodeDef<BonusStat>[];
}

function node(
  id: string,
  branch: string,
  name: string,
  blurb: string,
  maxRank: number,
  modifiersPerRank: Partial<Record<BonusStat, { add?: number; multiply?: number }>>,
  requiresPointsInBranch = 0,
): TalentNodeDef<BonusStat> & { name: string; blurb: string } {
  return { id, branch, maxRank, modifiersPerRank, requiresPointsInBranch, name, blurb };
}

export type CharacterNode = ReturnType<typeof node>;

export const CHARACTERS: readonly CharacterDef[] = [
  {
    id: "gunk",
    name: "Gunk",
    className: "Gunzerker",
    tagline: "More bullets. More guns. More everything.",
    color: "#e23c2e",
    branches: [
      { id: "rampage", name: "Rampage", flavor: "Shoot faster the angrier you get" },
      { id: "brawn", name: "Brawn", flavor: "Too stubborn to die" },
      { id: "hoarder", name: "Hoarder", flavor: "Never stop for ammo again" },
    ],
    nodes: [
      node("sal_locked_loaded", "rampage", "Locked and Loaded", "+6% fire rate per rank", 5, { fireRate: { add: 0.06 } }),
      node("sal_all_i_need", "rampage", "All I Need Is One", "+5% gun damage per rank", 5, { gunDamage: { add: 0.05 } }, 5),
      node("sal_keep_firing", "rampage", "Keep Firing!", "+25% fire rate, +10% gun damage", 1, { fireRate: { add: 0.25 }, gunDamage: { add: 0.1 } }, 10),
      node("sal_hard_to_kill", "brawn", "Hard to Kill", "+8% max health per rank", 5, { maxHealth: { add: 0.08 } }),
      node("sal_die_hard", "brawn", "I'm Not Dead Yet", "+15% Fight-For-Your-Life time per rank", 5, { ffylTime: { add: 0.15 } }, 5),
      node("sal_come_at_me", "brawn", "Come At Me Bro", "Power Surges restore +50% more health", 1, { secondWindHeal: { add: 0.5 } }, 10),
      node("sal_pack_rat", "hoarder", "Filled to the Brim", "+10% magazine size per rank", 5, { magSize: { add: 0.1 } }),
      node("sal_fast_hands", "hoarder", "Quick Draw", "+8% reload speed per rank", 5, { reloadSpeed: { add: 0.08 } }, 5),
      node("sal_free_bullets", "hoarder", "5 Shots or 6", "20% chance shots refund ammo", 1, { ammoRefund: { add: 0.2 } }, 10),
    ],
  },
  {
    id: "nyx",
    name: "Nyx",
    className: "Siren",
    tagline: "Burn, shock, and melt everything that moves.",
    color: "#3fc9ff",
    branches: [
      { id: "cataclysm", name: "Cataclysm", flavor: "Elements are a lifestyle" },
      { id: "harmony", name: "Harmony", flavor: "Life flows back to you" },
      { id: "motion", name: "Motion", flavor: "Untouchable, unstoppable" },
    ],
    nodes: [
      node("maya_flicker", "cataclysm", "Flicker", "+8% elemental proc chance per rank", 5, { elementChance: { add: 0.08 } }),
      node("maya_immolate", "cataclysm", "Immolate", "+12% elemental DoT damage per rank", 5, { dotDamage: { add: 0.12 } }, 5),
      node("maya_ruin", "cataclysm", "Ruin", "+30% proc chance, +25% DoT damage", 1, { elementChance: { add: 0.3 }, dotDamage: { add: 0.25 } }, 10),
      node("maya_ward", "harmony", "Ward", "+10% shield recharge per rank", 5, { shieldRegen: { add: 0.1 } }),
      node("maya_restoration", "harmony", "Restoration", "+7% max health per rank", 5, { maxHealth: { add: 0.07 } }, 5),
      node("maya_res", "harmony", "Res", "Power Surges fully restore your shield and +40% health", 1, { secondWindHeal: { add: 0.4 } }, 10),
      node("maya_fleet", "motion", "Fleet", "+5% move speed per rank", 5, { moveSpeed: { add: 0.05 } }),
      node("maya_inertia", "motion", "Inertia", "Shield recharge starts 8% sooner per rank", 5, { shieldDelay: { add: 0.08 } }, 5),
      node("maya_thoughtlock", "motion", "Sub-Sequence", "+15% fire rate and +10% move speed", 1, { fireRate: { add: 0.15 }, moveSpeed: { add: 0.1 } }, 10),
    ],
  },
  {
    id: "zero",
    name: "Cipher",
    className: "Assassin",
    tagline: "A critical hit haiku, / delivered from far away, / you were never here.",
    color: "#9dff2e",
    branches: [
      { id: "sniping", name: "Sniping", flavor: "One shot, one kill" },
      { id: "cunning", name: "Cunning", flavor: "Fast hands, faster exits" },
      { id: "bloodshed", name: "Bloodshed", flavor: "Kills feed the next kill" },
    ],
    nodes: [
      node("zero_headshot", "sniping", "Head Sh0t", "+5% crit chance per rank", 5, { critChance: { add: 0.05 } }),
      node("zero_precision", "sniping", "Precisi0n", "+15% crit damage per rank", 5, { critDamage: { add: 0.15 } }, 5),
      node("zero_critical_ascension", "sniping", "Critical Ascensi0n", "+15% crit chance, +50% crit damage", 1, { critChance: { add: 0.15 }, critDamage: { add: 0.5 } }, 10),
      node("zero_fast_hands", "cunning", "Fast Hands", "+10% reload speed per rank", 5, { reloadSpeed: { add: 0.1 } }),
      node("zero_ambush", "cunning", "Ambush", "+6% gun damage per rank", 5, { gunDamage: { add: 0.06 } }, 5),
      node("zero_deathmark", "cunning", "Death Mark", "Crits refund ammo 25% of the time", 1, { ammoRefund: { add: 0.25 } }, 10),
      node("zero_grim", "bloodshed", "Grim", "+6% shield recharge per rank", 5, { shieldRegen: { add: 0.06 } }),
      node("zero_following", "bloodshed", "F0llowthr0ugh", "+4% move speed per rank", 5, { moveSpeed: { add: 0.04 } }, 5),
      node("zero_many_must_fall", "bloodshed", "Many Must Fall", "+20% grenade damage and +10% gun damage", 1, { grenadeDamage: { add: 0.2 }, gunDamage: { add: 0.1 } }, 10),
    ],
  },
];

export function characterById(id: string): CharacterDef | undefined {
  return CHARACTERS.find((character) => character.id === id);
}

export function characterNodes(character: CharacterDef): readonly CharacterNode[] {
  return character.nodes as readonly CharacterNode[];
}

let activeCharacterId: string | null = null;
let activeTree: TalentTree<BonusStat> | null = null;

export function pickCharacter(id: string): CharacterDef | null {
  const def = characterById(id);
  if (def === undefined) return null;
  activeCharacterId = id;
  activeTree = createTalentTree<BonusStat>({ nodes: def.nodes, points: 0 });
  return def;
}

export function activeCharacter(): CharacterDef | null {
  return activeCharacterId === null ? null : (characterById(activeCharacterId) ?? null);
}

export function talentTree(): TalentTree<BonusStat> | null {
  return activeTree;
}

export function bonus(stat: BonusStat): number {
  if (activeTree === null) return 0;
  return activeTree.resolved().stats[stat]?.add ?? 0;
}

export function resetCharacterState(): void {
  activeCharacterId = null;
  activeTree = null;
}
