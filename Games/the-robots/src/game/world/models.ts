import type { ModelConfig, ModelMaterialOverride } from "@jgengine/core/game/playableGame";
import { assets, FAMILY_COLORS, NPC_STYLES } from "../assets";
import { enemies, type EnemyDef } from "../entities/enemies/catalog";

function modelWith(id: string, overrides: Partial<ModelConfig> = {}): ModelConfig {
  const base = assets.resolve(id);
  if (base === null) throw new Error(`models: unresolved asset id "${id}"`);
  return { url: base.url, dims: base.dims, ...overrides };
}

type RigKind = "humanoid" | "alien" | "mech";

const BASE_HEIGHT: Record<RigKind, number> = { humanoid: 1.8, alien: 1.2, mech: 1.7 };

const RIG_BY_ID: Record<string, { kind: RigKind; asset: string }> = {
  psycho: { kind: "humanoid", asset: "kenney-mini-characters/character-male-a" },
  marauder: { kind: "humanoid", asset: "kenney-mini-characters/character-male-b" },
  nomad: { kind: "mech", asset: "kenney-space/rover" },
  badass_psycho: { kind: "humanoid", asset: "kenney-mini-characters/character-male-d" },
  skag_pup: { kind: "alien", asset: "kenney-space/alien" },
  skag: { kind: "alien", asset: "kenney-space/alien" },
  badass_skag: { kind: "alien", asset: "kenney-space/alien" },
  bullymong_brat: { kind: "alien", asset: "kenney-space/alien" },
  bullymong: { kind: "alien", asset: "kenney-space/alien" },
  spiderant: { kind: "alien", asset: "kenney-space/alien" },
  spiderant_soldier: { kind: "alien", asset: "kenney-space/alien" },
  loader: { kind: "mech", asset: "kenney-space/rover" },
  loader_war: { kind: "mech", asset: "kenney-space/rover" },
  badass_loader: { kind: "mech", asset: "kenney-space/rover" },
  bad_maw: { kind: "alien", asset: "kenney-space/alien" },
  captain_rusk: { kind: "humanoid", asset: "kenney-mini-characters/character-male-e" },
};

const GUN_ATTACHMENTS: Record<string, string> = {
  marauder: "kenney-blaster/blaster-b",
  captain_rusk: "kenney-blaster/blaster-o",
};

const HUMANOID_ANIMATION = {
  states: { idle: "idle", walk: "walk", run: "sprint", walkSpeed: 0.4, runSpeed: 5.5 },
} as const;

function enemyModel(def: EnemyDef): ModelConfig {
  const rig = RIG_BY_ID[def.id];
  if (rig === undefined) throw new Error(`models: no rig mapping for enemy "${def.id}"`);
  const colors = FAMILY_COLORS[def.id] ?? FAMILY_COLORS.psycho!;
  const metal = rig.kind !== "alien";
  const gun = GUN_ATTACHMENTS[def.id];
  const material: ModelMaterialOverride = {
    color: colors.body,
    metalness: metal ? 0.55 : 0.15,
    roughness: metal ? 0.45 : 0.75,
    ...(def.badass ? { emissive: colors.accent, emissiveIntensity: 0.5 } : {}),
  };
  return modelWith(rig.asset, {
    targetHeight: BASE_HEIGHT[rig.kind] * def.scale,
    material,
    ...(rig.kind === "humanoid"
      ? {
          animation: {
            ...HUMANOID_ANIMATION,
            oneShots: { death: "die", attack: gun !== undefined ? "holding-right-shoot" : "attack-melee-right" },
          },
        }
      : {}),
    ...(gun !== undefined ? { attachments: [{ slot: "arm-right", model: gun, position: [0, -0.28, 0.04] as const, scale: 0.6 }] } : {}),
  });
}

const THE_WARRIOR_HEIGHT = BASE_HEIGHT.mech * 3.2;

export const entityModels: Record<string, ModelConfig> = {
  ...Object.fromEntries(
    enemies.filter((def) => def.id !== "the_warrior").map((def) => [def.id, enemyModel(def)]),
  ),
  the_warrior: modelWith("kenney-space/rover", {
    targetHeight: THE_WARRIOR_HEIGHT,
    material: { color: "#8a2f1e", metalness: 0.6, roughness: 0.35, emissive: "#ff9a00", emissiveIntensity: 0.9 },
    parts: [{ model: "kenney-space/turret_double", position: [0, THE_WARRIOR_HEIGHT * 0.55, 0], scale: 1.4 }],
  }),
  bolt: modelWith("kenney-space/turret_single", {
    targetHeight: 0.9,
    material: { color: "#c9a23a", emissive: "#3fc9ff", emissiveIntensity: 1.2 },
  }),
  dr_sparx: modelWith("kenney-mini-characters/character-female-a", {
    targetHeight: BASE_HEIGHT.humanoid,
    material: { color: NPC_STYLES.dr_sparx!.coat },
  }),
  rigg: modelWith("kenney-mini-characters/character-male-c", {
    targetHeight: BASE_HEIGHT.humanoid,
    material: { color: NPC_STYLES.rigg!.coat },
  }),
  gauge: modelWith("kenney-mini-characters/character-male-f", {
    targetHeight: BASE_HEIGHT.humanoid,
    material: { color: NPC_STYLES.gauge!.coat },
  }),
  reactor_hunter: modelWith("kenney-mini-characters/character-female-b", {
    targetHeight: BASE_HEIGHT.humanoid,
    material: { color: "#5a5a5a", metalness: 0.5, roughness: 0.4 },
  }),
};

export const objectModels: Record<string, ModelConfig> = {
  red_chest: modelWith("kenney-survival/chest", { scale: 2.3 }),
  ammo_chest: modelWith("kenney-survival/box", { scale: 3 }),
  vendor_rigg: modelWith("kenney-space/desk_computer", {
    scale: 2.6,
    material: { emissive: "#ffb400", emissiveIntensity: 0.5 },
  }),
  vendor_zed: modelWith("kenney-space/desk_computerCorner", {
    scale: 2,
    material: { emissive: "#e23c2e", emissiveIntensity: 0.4 },
  }),
  new_u_station: modelWith("kenney-space/machine_wireless", {
    scale: 2.2,
    material: { color: "#2f8cff", emissive: "#2f8cff", emissiveIntensity: 0.8 },
  }),
  bandit_barrel: modelWith("kenney-space/barrel", {
    scale: 3.2,
    material: { color: "#b3452a", emissive: "#e2582e", emissiveIntensity: 0.2 },
  }),
  fast_travel: modelWith("kenney-space/gate_simple", {
    scale: 2.2,
    material: { emissive: "#38e1ff", emissiveIntensity: 1 },
  }),
  black_market: modelWith("kenney-space/gate_complex", {
    scale: 2.2,
    material: { emissive: "#8a2be2", emissiveIntensity: 0.6 },
  }),
  rock_spire: modelWith("kenney-nature/rock_tallF", { scale: 4 }),
  dead_tree: modelWith("kenney-nature/stump_oldTall", { scale: 3 }),
  wreck: modelWith("kenney-space/structure_closed", {
    scale: 1.6,
    material: { color: "#7a5a3a", roughness: 1 },
  }),
  barricade: modelWith("kenney-survival/fence-fortified", { scale: 2.8 }),
  watchtower: modelWith("kenney-space/platform_high", {
    scale: 1.8,
    parts: [{ model: "kenney-space/turret_single", position: [0, 1.8, 0], scale: 1.4 }],
  }),
  tent: modelWith("kenney-nature/tent_detailedClosed", { scale: 2.4 }),
  signpost: modelWith("kenney-survival/signpost", { scale: 4 }),
  street_lamp: modelWith("kenney-space/machine_wireless", {
    scale: 2.6,
    material: { emissive: "#ffd98a", emissiveIntensity: 1 },
  }),
  road_marker: modelWith("kenney-survival/signpost-single", { scale: 2 }),
  bus_wreck: modelWith("kenney-space/craft_cargoA", {
    scale: 2.45,
    material: { color: "#b5893a", roughness: 0.9 },
  }),
  water_tower: modelWith("kenney-space/hangar_roundB", { scale: 1.22 }),
  bone_arch: modelWith("kenney-nature/statue_ring", { scale: 3.2, material: { color: "#e0d6c2" } }),
  reactor_gate: modelWith("kenney-space/hangar_roundGlass", {
    scale: 1.6,
    material: { color: "#3a2c4a", emissive: "#c05cff", emissiveIntensity: 0.9 },
  }),
  cover_crate: modelWith("kenney-survival/box-large", { scale: 3.2 }),
  banner_pole: modelWith("kenney-mini-arena/banner", { scale: 3, material: { color: "#7a2c1e" } }),
};
