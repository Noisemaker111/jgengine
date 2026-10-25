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
  | "reserveTime"
  | "powerSurgeHeal"
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
    className: "Barrage Operator",
    tagline: "More bullets. More guns. More everything.",
    color: "#e23c2e",
    branches: [
      { id: "barrage", name: "Barrage", flavor: "Shoot faster the angrier you get" },
      { id: "chassis", name: "Chassis", flavor: "Too stubborn to die" },
      { id: "logistics", name: "Logistics", flavor: "Never stop for ammo again" },
    ],
    nodes: [
      node("gunk_hot_chamber", "barrage", "Hot Chamber", "+6% fire rate per rank", 5, { fireRate: { add: 0.06 } }),
      node("gunk_heavy_feed", "barrage", "Heavy Feed", "+5% gun damage per rank", 5, { gunDamage: { add: 0.05 } }, 5),
      node("gunk_sustained_burst", "barrage", "Sustained Burst", "+25% fire rate, +10% gun damage", 1, { fireRate: { add: 0.25 }, gunDamage: { add: 0.1 } }, 10),
      node("gunk_reinforced_chassis", "chassis", "Reinforced Chassis", "+8% max health per rank", 5, { maxHealth: { add: 0.08 } }),
      node("gunk_reserve_capacity", "chassis", "Reserve Capacity", "+15% Emergency Reserve time per rank", 5, { reserveTime: { add: 0.15 } }, 5),
      node("gunk_overload_recovery", "chassis", "Overload Recovery", "Power Surges restore +50% more health", 1, { powerSurgeHeal: { add: 0.5 } }, 10),
      node("gunk_expanded_drum", "logistics", "Expanded Drum", "+10% magazine size per rank", 5, { magSize: { add: 0.1 } }),
      node("gunk_feed_coupler", "logistics", "Feed Coupler", "+8% reload speed per rank", 5, { reloadSpeed: { add: 0.08 } }, 5),
      node("gunk_return_feed", "logistics", "Return Feed", "20% chance shots refund ammo", 1, { ammoRefund: { add: 0.2 } }, 10),
    ],
  },
  {
    id: "nyx",
    name: "Nyx",
    className: "Flux Engineer",
    tagline: "Burn, shock, and melt everything that moves.",
    color: "#3fc9ff",
    branches: [
      { id: "flux_cascade", name: "Flux Cascade", flavor: "Elements are a lifestyle" },
      { id: "recirculation", name: "Recirculation", flavor: "Life flows back to you" },
      { id: "slipstream", name: "Slipstream", flavor: "Untouchable, unstoppable" },
    ],
    nodes: [
      node("nyx_charge_seeding", "flux_cascade", "Charge Seeding", "+8% elemental proc chance per rank", 5, { elementChance: { add: 0.08 } }),
      node("nyx_thermal_leakage", "flux_cascade", "Thermal Leakage", "+12% elemental DoT damage per rank", 5, { dotDamage: { add: 0.12 } }, 5),
      node("nyx_arc_saturation", "flux_cascade", "Arc Saturation", "+30% proc chance, +25% DoT damage", 1, { elementChance: { add: 0.3 }, dotDamage: { add: 0.25 } }, 10),
      node("nyx_buffer_mesh", "recirculation", "Buffer Mesh", "+10% shield recharge per rank", 5, { shieldRegen: { add: 0.1 } }),
      node("nyx_vital_capacitor", "recirculation", "Vital Capacitor", "+7% max health per rank", 5, { maxHealth: { add: 0.07 } }, 5),
      node("nyx_reserve_reboot", "recirculation", "Reserve Reboot", "Power Surges fully restore your shield and +40% health", 1, { powerSurgeHeal: { add: 0.4 } }, 10),
      node("nyx_lightweight_rails", "slipstream", "Lightweight Rails", "+5% move speed per rank", 5, { moveSpeed: { add: 0.05 } }),
      node("nyx_fast_capacitor", "slipstream", "Fast Capacitor", "Shield recharge starts 8% sooner per rank", 5, { shieldDelay: { add: 0.08 } }, 5),
      node("nyx_slipstream_coupling", "slipstream", "Slipstream Coupling", "+15% fire rate and +10% move speed", 1, { fireRate: { add: 0.15 }, moveSpeed: { add: 0.1 } }, 10),
    ],
  },
  {
    id: "cipher",
    name: "Cipher",
    className: "Route Scout",
    tagline: "Read the wind. Mark the route. Make the shot.",
    color: "#9dff2e",
    branches: [
      { id: "rangefinding", name: "Rangefinding", flavor: "One shot, one kill" },
      { id: "fieldwork", name: "Fieldwork", flavor: "Fast hands, faster exits" },
      { id: "chain_reaction", name: "Chain Reaction", flavor: "Kills feed the next kill" },
    ],
    nodes: [
      node("cipher_optic_calibration", "rangefinding", "Optic Calibration", "+5% crit chance per rank", 5, { critChance: { add: 0.05 } }),
      node("cipher_steady_circuit", "rangefinding", "Steady Circuit", "+15% crit damage per rank", 5, { critDamage: { add: 0.15 } }, 5),
      node("cipher_longshot_array", "rangefinding", "Longshot Array", "+15% crit chance, +50% crit damage", 1, { critChance: { add: 0.15 }, critDamage: { add: 0.5 } }, 10),
      node("cipher_rapid_magazine", "fieldwork", "Rapid Magazine", "+10% reload speed per rank", 5, { reloadSpeed: { add: 0.1 } }),
      node("cipher_survey_advantage", "fieldwork", "Survey Advantage", "+6% gun damage per rank", 5, { gunDamage: { add: 0.06 } }, 5),
      node("cipher_target_ledger", "fieldwork", "Target Ledger", "Crits refund ammo 25% of the time", 1, { ammoRefund: { add: 0.25 } }, 10),
      node("cipher_shield_harvester", "chain_reaction", "Shield Harvester", "+6% shield recharge per rank", 5, { shieldRegen: { add: 0.06 } }),
      node("cipher_exit_vector", "chain_reaction", "Exit Vector", "+4% move speed per rank", 5, { moveSpeed: { add: 0.04 } }, 5),
      node("cipher_scatter_protocol", "chain_reaction", "Scatter Protocol", "+20% grenade damage and +10% gun damage", 1, { grenadeDamage: { add: 0.2 }, gunDamage: { add: 0.1 } }, 10),
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
