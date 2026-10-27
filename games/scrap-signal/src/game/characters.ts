import { createTalentTree, type TalentNodeDef, type TalentTree } from "@jgengine/core/talents/talents";

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
      node("gunk_trigger_discipline", "barrage", "Trigger Discipline", "+4% crit chance per rank", 5, { critChance: { add: 0.04 } }),
      node("gunk_heavy_feed", "barrage", "Heavy Feed", "+5% gun damage per rank", 5, { gunDamage: { add: 0.05 } }, 5),
      node("gunk_hot_brass", "barrage", "Hot Brass", "+6% elemental proc chance per rank", 5, { elementChance: { add: 0.06 } }, 5),
      node("gunk_sustained_burst", "barrage", "Sustained Burst", "+25% fire rate, +10% gun damage", 1, { fireRate: { add: 0.25 }, gunDamage: { add: 0.1 } }, 10),
      node("gunk_belt_feed", "barrage", "Belt Feed", "+8% magazine size per rank", 5, { magSize: { add: 0.08 } }, 10),
      node("gunk_overdrive", "barrage", "Overdrive", "+10% crit damage per rank", 5, { critDamage: { add: 0.1 } }, 15),
      node("gunk_burning_barrels", "barrage", "Burning Barrels", "+10% elemental DoT damage per rank", 5, { dotDamage: { add: 0.1 } }, 15),
      node("gunk_all_guns_blazing", "barrage", "All Guns Blazing", "+20% gun damage, +15% fire rate", 1, { gunDamage: { add: 0.2 }, fireRate: { add: 0.15 } }, 20),
      node("gunk_reinforced_chassis", "chassis", "Reinforced Chassis", "+8% max health per rank", 5, { maxHealth: { add: 0.08 } }),
      node("gunk_thick_plating", "chassis", "Thick Plating", "+8% shield recharge per rank", 5, { shieldRegen: { add: 0.08 } }),
      node("gunk_reserve_capacity", "chassis", "Reserve Capacity", "+15% Emergency Reserve time per rank", 5, { reserveTime: { add: 0.15 } }, 5),
      node("gunk_stubborn", "chassis", "Stubborn", "Shield recharge starts 6% sooner per rank", 5, { shieldDelay: { add: 0.06 } }, 5),
      node("gunk_overload_recovery", "chassis", "Overload Recovery", "Power Surges restore +50% more health", 1, { powerSurgeHeal: { add: 0.5 } }, 10),
      node("gunk_heavy_stride", "chassis", "Heavy Stride", "+3% move speed per rank", 5, { moveSpeed: { add: 0.03 } }, 10),
      node("gunk_iron_hide", "chassis", "Iron Hide", "+6% max health per rank", 5, { maxHealth: { add: 0.06 } }, 15),
      node("gunk_second_engine", "chassis", "Second Engine", "+10% Emergency Reserve time per rank", 5, { reserveTime: { add: 0.1 } }, 15),
      node("gunk_unkillable", "chassis", "Unkillable", "+25% max health; Power Surges restore +50% more health", 1, { maxHealth: { add: 0.25 }, powerSurgeHeal: { add: 0.5 } }, 20),
      node("gunk_expanded_drum", "logistics", "Expanded Drum", "+10% magazine size per rank", 5, { magSize: { add: 0.1 } }),
      node("gunk_grenade_pouch", "logistics", "Grenade Pouch", "+8% grenade damage per rank", 5, { grenadeDamage: { add: 0.08 } }),
      node("gunk_feed_coupler", "logistics", "Feed Coupler", "+8% reload speed per rank", 5, { reloadSpeed: { add: 0.08 } }, 5),
      node("gunk_scrounger", "logistics", "Scrounger", "+4% chance per rank that a shot refunds its ammo", 5, { ammoRefund: { add: 0.04 } }, 5),
      node("gunk_return_feed", "logistics", "Return Feed", "20% chance shots refund ammo", 1, { ammoRefund: { add: 0.2 } }, 10),
      node("gunk_loose_rounds", "logistics", "Loose Rounds", "+4% gun damage per rank", 5, { gunDamage: { add: 0.04 } }, 10),
      node("gunk_shrapnel_packs", "logistics", "Shrapnel Packs", "+10% grenade damage per rank", 5, { grenadeDamage: { add: 0.1 } }, 15),
      node("gunk_speed_loader", "logistics", "Speed Loader", "+6% reload speed per rank", 5, { reloadSpeed: { add: 0.06 } }, 15),
      node("gunk_endless_belt", "logistics", "Endless Belt", "+50% magazine size; +15% chance shots refund ammo", 1, { magSize: { add: 0.5 }, ammoRefund: { add: 0.15 } }, 20),
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
      node("nyx_spark_gap", "flux_cascade", "Spark Gap", "+4% gun damage per rank", 5, { gunDamage: { add: 0.04 } }),
      node("nyx_thermal_leakage", "flux_cascade", "Thermal Leakage", "+12% elemental DoT damage per rank", 5, { dotDamage: { add: 0.12 } }, 5),
      node("nyx_conductive_rounds", "flux_cascade", "Conductive Rounds", "+4% crit chance per rank", 5, { critChance: { add: 0.04 } }, 5),
      node("nyx_arc_saturation", "flux_cascade", "Arc Saturation", "+30% proc chance, +25% DoT damage", 1, { elementChance: { add: 0.3 }, dotDamage: { add: 0.25 } }, 10),
      node("nyx_flashpoint", "flux_cascade", "Flashpoint", "+10% crit damage per rank", 5, { critDamage: { add: 0.1 } }, 10),
      node("nyx_meltdown", "flux_cascade", "Meltdown", "+10% elemental DoT damage per rank", 5, { dotDamage: { add: 0.1 } }, 15),
      node("nyx_static_field", "flux_cascade", "Static Field", "+5% elemental proc chance per rank", 5, { elementChance: { add: 0.05 } }, 15),
      node("nyx_singularity", "flux_cascade", "Singularity", "+40% elemental DoT damage, +20% gun damage", 1, { dotDamage: { add: 0.4 }, gunDamage: { add: 0.2 } }, 20),
      node("nyx_buffer_mesh", "recirculation", "Buffer Mesh", "+10% shield recharge per rank", 5, { shieldRegen: { add: 0.1 } }),
      node("nyx_coolant_loop", "recirculation", "Coolant Loop", "+5% reload speed per rank", 5, { reloadSpeed: { add: 0.05 } }),
      node("nyx_vital_capacitor", "recirculation", "Vital Capacitor", "+7% max health per rank", 5, { maxHealth: { add: 0.07 } }, 5),
      node("nyx_quick_restart", "recirculation", "Quick Restart", "+12% Emergency Reserve time per rank", 5, { reserveTime: { add: 0.12 } }, 5),
      node("nyx_reserve_reboot", "recirculation", "Reserve Reboot", "Power Surges fully restore your shield and +40% health", 1, { powerSurgeHeal: { add: 0.4 } }, 10),
      node("nyx_soft_landing", "recirculation", "Soft Landing", "Shield recharge starts 6% sooner per rank", 5, { shieldDelay: { add: 0.06 } }, 10),
      node("nyx_overflow", "recirculation", "Overflow", "+8% shield recharge per rank", 5, { shieldRegen: { add: 0.08 } }, 15),
      node("nyx_lifeline", "recirculation", "Lifeline", "+6% max health per rank", 5, { maxHealth: { add: 0.06 } }, 15),
      node("nyx_phoenix_loop", "recirculation", "Phoenix Loop", "Power Surges restore +60% health; +30% shield recharge", 1, { powerSurgeHeal: { add: 0.6 }, shieldRegen: { add: 0.3 } }, 20),
      node("nyx_lightweight_rails", "slipstream", "Lightweight Rails", "+5% move speed per rank", 5, { moveSpeed: { add: 0.05 } }),
      node("nyx_quickdraw", "slipstream", "Quickdraw", "+5% fire rate per rank", 5, { fireRate: { add: 0.05 } }),
      node("nyx_fast_capacitor", "slipstream", "Fast Capacitor", "Shield recharge starts 8% sooner per rank", 5, { shieldDelay: { add: 0.08 } }, 5),
      node("nyx_drift", "slipstream", "Drift", "+6% reload speed per rank", 5, { reloadSpeed: { add: 0.06 } }, 5),
      node("nyx_slipstream_coupling", "slipstream", "Slipstream Coupling", "+15% fire rate and +10% move speed", 1, { fireRate: { add: 0.15 }, moveSpeed: { add: 0.1 } }, 10),
      node("nyx_thin_shell", "slipstream", "Thin Shell", "+6% magazine size per rank", 5, { magSize: { add: 0.06 } }, 10),
      node("nyx_afterimage", "slipstream", "Afterimage", "+4% gun damage per rank", 5, { gunDamage: { add: 0.04 } }, 15),
      node("nyx_charged_grenades", "slipstream", "Charged Grenades", "+10% grenade damage per rank", 5, { grenadeDamage: { add: 0.1 } }, 15),
      node("nyx_lightspeed", "slipstream", "Lightspeed", "+20% move speed, +20% fire rate", 1, { moveSpeed: { add: 0.2 }, fireRate: { add: 0.2 } }, 20),
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
      node("cipher_dead_eye", "rangefinding", "Dead Eye", "+4% gun damage per rank", 5, { gunDamage: { add: 0.04 } }),
      node("cipher_steady_circuit", "rangefinding", "Steady Circuit", "+15% crit damage per rank", 5, { critDamage: { add: 0.15 } }, 5),
      node("cipher_windage", "rangefinding", "Windage", "+5% elemental proc chance per rank", 5, { elementChance: { add: 0.05 } }, 5),
      node("cipher_longshot_array", "rangefinding", "Longshot Array", "+15% crit chance, +50% crit damage", 1, { critChance: { add: 0.15 }, critDamage: { add: 0.5 } }, 10),
      node("cipher_breath_control", "rangefinding", "Breath Control", "+5% fire rate per rank", 5, { fireRate: { add: 0.05 } }, 10),
      node("cipher_kill_shot", "rangefinding", "Kill Shot", "+10% crit damage per rank", 5, { critDamage: { add: 0.1 } }, 15),
      node("cipher_hollow_points", "rangefinding", "Hollow Points", "+8% elemental DoT damage per rank", 5, { dotDamage: { add: 0.08 } }, 15),
      node("cipher_one_shot", "rangefinding", "One Shot", "+25% crit chance, +75% crit damage", 1, { critChance: { add: 0.25 }, critDamage: { add: 0.75 } }, 20),
      node("cipher_rapid_magazine", "fieldwork", "Rapid Magazine", "+10% reload speed per rank", 5, { reloadSpeed: { add: 0.1 } }),
      node("cipher_extended_clips", "fieldwork", "Extended Clips", "+8% magazine size per rank", 5, { magSize: { add: 0.08 } }),
      node("cipher_survey_advantage", "fieldwork", "Survey Advantage", "+6% gun damage per rank", 5, { gunDamage: { add: 0.06 } }, 5),
      node("cipher_field_kit", "fieldwork", "Field Kit", "+6% max health per rank", 5, { maxHealth: { add: 0.06 } }, 5),
      node("cipher_target_ledger", "fieldwork", "Target Ledger", "Crits refund ammo 25% of the time", 1, { ammoRefund: { add: 0.25 } }, 10),
      node("cipher_scavenger", "fieldwork", "Scavenger", "+4% chance per rank that a shot refunds its ammo", 5, { ammoRefund: { add: 0.04 } }, 10),
      node("cipher_quick_scope", "fieldwork", "Quick Scope", "+6% reload speed per rank", 5, { reloadSpeed: { add: 0.06 } }, 15),
      node("cipher_marked", "fieldwork", "Marked", "+4% crit chance per rank", 5, { critChance: { add: 0.04 } }, 15),
      node("cipher_clean_exit", "fieldwork", "Clean Exit", "+25% gun damage, +20% reload speed", 1, { gunDamage: { add: 0.25 }, reloadSpeed: { add: 0.2 } }, 20),
      node("cipher_shield_harvester", "chain_reaction", "Shield Harvester", "+6% shield recharge per rank", 5, { shieldRegen: { add: 0.06 } }),
      node("cipher_fragmentation", "chain_reaction", "Fragmentation", "+8% grenade damage per rank", 5, { grenadeDamage: { add: 0.08 } }),
      node("cipher_exit_vector", "chain_reaction", "Exit Vector", "+4% move speed per rank", 5, { moveSpeed: { add: 0.04 } }, 5),
      node("cipher_second_breath", "chain_reaction", "Second Breath", "+12% Emergency Reserve time per rank", 5, { reserveTime: { add: 0.12 } }, 5),
      node("cipher_scatter_protocol", "chain_reaction", "Scatter Protocol", "+20% grenade damage and +10% gun damage", 1, { grenadeDamage: { add: 0.2 }, gunDamage: { add: 0.1 } }, 10),
      node("cipher_relay", "chain_reaction", "Relay", "Shield recharge starts 6% sooner per rank", 5, { shieldDelay: { add: 0.06 } }, 10),
      node("cipher_momentum", "chain_reaction", "Momentum", "+5% fire rate per rank", 5, { fireRate: { add: 0.05 } }, 15),
      node("cipher_recharge", "chain_reaction", "Recharge", "Power Surges restore +10% more health per rank", 5, { powerSurgeHeal: { add: 0.1 } }, 15),
      node("cipher_cascade", "chain_reaction", "Cascade", "+30% grenade damage, +15% fire rate, +10% move speed", 1, { grenadeDamage: { add: 0.3 }, fireRate: { add: 0.15 }, moveSpeed: { add: 0.1 } }, 20),
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
