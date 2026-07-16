import type { ModelConfig, ModelMaterialOverride } from "@jgengine/core/game/playableGame";
import { pickModel, resolveModelPlan, type ModelPick } from "@jgengine/shell/render/resolveModel";

import { assets, FAMILY_COLORS, NPC_STYLES } from "../assets";
import { enemies, type EnemyDef } from "../entities/enemies/catalog";

type RigKind = "humanoid" | "alien" | "mech";

const BASE_HEIGHT: Record<RigKind, number> = { humanoid: 1.8, alien: 1.2, mech: 1.7 };

const CHAR = "kaykit-adventurers";
const CHAR_FB = "quaternius-base-characters";
const SCIFI = "quaternius-modular-scifi";
const NATURE = "quaternius-stylized-nature";
const PROPS = "quaternius-fantasy-props";

/**
 * Art plan: preferred catalog ids (Quaternius / KayKit). Soft-resolve via
 * pickModel — missing packs → shell primitives until Batch 2–4 pull/reindex.
 */
const RIG_BY_ID: Record<string, { kind: RigKind; model: string; fallbackModel?: string }> = {
  psycho: { kind: "humanoid", model: `${CHAR}/Rogue`, fallbackModel: `${CHAR_FB}/Character_Male_1` },
  marauder: { kind: "humanoid", model: `${CHAR}/Barbarian`, fallbackModel: `${CHAR_FB}/Character_Male_2` },
  nomad: { kind: "mech", model: `${SCIFI}/rover`, fallbackModel: `${SCIFI}/astronautA` },
  badass_psycho: { kind: "humanoid", model: `${CHAR}/Knight`, fallbackModel: `${CHAR_FB}/Character_Male_3` },
  skag_pup: { kind: "alien", model: `${SCIFI}/alien`, fallbackModel: `${SCIFI}/astronautB` },
  skag: { kind: "alien", model: `${SCIFI}/alien`, fallbackModel: `${SCIFI}/astronautB` },
  badass_skag: { kind: "alien", model: `${SCIFI}/alien`, fallbackModel: `${SCIFI}/astronautC` },
  bullymong_brat: { kind: "alien", model: `${SCIFI}/alien`, fallbackModel: `${SCIFI}/astronautB` },
  bullymong: { kind: "alien", model: `${SCIFI}/alien`, fallbackModel: `${SCIFI}/astronautB` },
  spiderant: { kind: "alien", model: `${SCIFI}/alien`, fallbackModel: `${SCIFI}/astronautB` },
  spiderant_soldier: { kind: "alien", model: `${SCIFI}/alien`, fallbackModel: `${SCIFI}/astronautC` },
  loader: { kind: "mech", model: `${SCIFI}/rover`, fallbackModel: `${SCIFI}/astronautA` },
  loader_war: { kind: "mech", model: `${SCIFI}/rover`, fallbackModel: `${SCIFI}/astronautA` },
  badass_loader: { kind: "mech", model: `${SCIFI}/rover`, fallbackModel: `${SCIFI}/astronautA` },
  bad_maw: { kind: "alien", model: `${SCIFI}/alien`, fallbackModel: `${SCIFI}/astronautC` },
  captain_rusk: { kind: "humanoid", model: `${CHAR}/Mage`, fallbackModel: `${CHAR_FB}/Character_Male_4` },
};

const GUN_PLAN: Record<string, ModelPick> = {
  marauder: { model: `${SCIFI}/weapon_gun` },
  captain_rusk: { model: `${SCIFI}/weapon_rifle` },
};

const HUMANOID_ANIMATION = {
  states: { idle: "idle", walk: "walk", run: "sprint", walkSpeed: 0.4, runSpeed: 5.5 },
} as const;

function enemyPick(def: EnemyDef): ModelPick | null {
  const rig = RIG_BY_ID[def.id];
  if (rig === undefined) return null;
  const colors = FAMILY_COLORS[def.id] ?? FAMILY_COLORS.psycho!;
  const metal = rig.kind !== "alien";
  const material: ModelMaterialOverride = {
    color: colors.body,
    metalness: metal ? 0.55 : 0.15,
    roughness: metal ? 0.45 : 0.75,
    ...(def.badass ? { emissive: colors.accent, emissiveIntensity: 0.5 } : {}),
  };
  const gun = GUN_PLAN[def.id];
  const gunModel = gun === undefined ? undefined : pickModel(assets, gun);
  return {
    model: rig.model,
    fallbackModel: rig.fallbackModel,
    style: {
      targetHeight: BASE_HEIGHT[rig.kind] * def.scale,
      material,
      ...(rig.kind === "humanoid"
        ? {
            animation: {
              ...HUMANOID_ANIMATION,
              oneShots: {
                death: "die",
                attack: gunModel !== undefined ? "holding-right-shoot" : "attack-melee-right",
              },
            },
          }
        : {}),
      ...(gunModel !== undefined
        ? { attachments: [{ slot: "arm-right", model: gunModel, position: [0, -0.28, 0.04] as const, scale: 0.6 }] }
        : {}),
    },
  };
}

const THE_WARRIOR_HEIGHT = BASE_HEIGHT.mech * 3.2;

function buildEntityModels(): Record<string, ModelConfig> {
  const plan: Record<string, ModelPick> = {};
  for (const def of enemies) {
    if (def.id === "the_warrior") continue;
    const pick = enemyPick(def);
    if (pick !== null) plan[def.id] = pick;
  }
  plan.the_warrior = {
    model: `${SCIFI}/rover`,
    fallbackModel: `${SCIFI}/astronautA`,
    style: {
      targetHeight: THE_WARRIOR_HEIGHT,
      material: { color: "#8a2f1e", metalness: 0.6, roughness: 0.35, emissive: "#ff9a00", emissiveIntensity: 0.9 },
    },
  };
  plan.bolt = {
    model: `${SCIFI}/turret_single`,
    fallbackModel: `${SCIFI}/astronautA`,
    style: {
      targetHeight: 0.9,
      material: { color: "#c9a23a", emissive: "#3fc9ff", emissiveIntensity: 1.2 },
    },
  };
  plan.dr_sparx = {
    model: `${CHAR}/Mage`,
    fallbackModel: `${CHAR_FB}/Character_Female_1`,
    style: { targetHeight: BASE_HEIGHT.humanoid, material: { color: NPC_STYLES.dr_sparx!.coat } },
  };
  plan.rigg = {
    model: `${CHAR}/Barbarian`,
    fallbackModel: `${CHAR_FB}/Character_Male_2`,
    style: { targetHeight: BASE_HEIGHT.humanoid, material: { color: NPC_STYLES.rigg!.coat } },
  };
  plan.gauge = {
    model: `${CHAR}/Knight`,
    fallbackModel: `${CHAR_FB}/Character_Male_3`,
    style: { targetHeight: BASE_HEIGHT.humanoid, material: { color: NPC_STYLES.gauge!.coat } },
  };
  plan.reactor_hunter = {
    model: `${CHAR}/Rogue`,
    fallbackModel: `${CHAR_FB}/Character_Female_2`,
    style: {
      targetHeight: BASE_HEIGHT.humanoid,
      material: { color: "#5a5a5a", metalness: 0.5, roughness: 0.4 },
    },
  };
  return resolveModelPlan(assets, plan);
}

export const entityModels: Record<string, ModelConfig> = buildEntityModels();

export const objectModels: Record<string, ModelConfig> = resolveModelPlan(assets, {
  red_chest: { model: `${PROPS}/Chest`, fallbackModel: `${SCIFI}/crate`, style: { scale: 2.3 } },
  ammo_chest: { model: `${PROPS}/Crate`, fallbackModel: `${SCIFI}/crate`, style: { scale: 3 } },
  vendor_rigg: {
    model: `${SCIFI}/desk_computer`,
    fallbackModel: `${SCIFI}/astronautA`,
    style: { scale: 2.6, material: { emissive: "#ffb400", emissiveIntensity: 0.5 } },
  },
  vendor_zed: {
    model: `${SCIFI}/desk_computerCorner`,
    fallbackModel: `${SCIFI}/astronautA`,
    style: { scale: 2, material: { emissive: "#e23c2e", emissiveIntensity: 0.4 } },
  },
  new_u_station: {
    model: `${SCIFI}/machine_wireless`,
    fallbackModel: `${SCIFI}/astronautA`,
    style: { scale: 2.2, material: { color: "#2f8cff", emissive: "#2f8cff", emissiveIntensity: 0.8 } },
  },
  bandit_barrel: {
    model: `${SCIFI}/barrel`,
    fallbackModel: `${PROPS}/Barrel`,
    style: { scale: 3.2, material: { color: "#b3452a", emissive: "#e2582e", emissiveIntensity: 0.2 } },
  },
  fast_travel: {
    model: `${SCIFI}/gate_simple`,
    fallbackModel: `${SCIFI}/astronautA`,
    style: { scale: 2.2, material: { emissive: "#38e1ff", emissiveIntensity: 1 } },
  },
  black_market: {
    model: `${SCIFI}/gate_complex`,
    fallbackModel: `${SCIFI}/astronautA`,
    style: { scale: 2.2, material: { emissive: "#8a2be2", emissiveIntensity: 0.6 } },
  },
  rock_spire: {
    model: `${NATURE}/rock_tallF`,
    fallbackModel: `${NATURE}/tree_pineDefaultA`,
    style: { scale: 4 },
  },
  dead_tree: {
    model: `${NATURE}/stump_oldTall`,
    fallbackModel: `${NATURE}/tree_pineDefaultA`,
    style: { scale: 3 },
  },
  wreck: {
    model: `${SCIFI}/structure_closed`,
    fallbackModel: `${SCIFI}/astronautA`,
    style: { scale: 1.6, material: { color: "#7a5a3a", roughness: 1 } },
  },
  barricade: { model: `${PROPS}/Fence`, fallbackModel: `${SCIFI}/crate`, style: { scale: 2.8 } },
  watchtower: {
    model: `${SCIFI}/platform_high`,
    fallbackModel: `${SCIFI}/astronautA`,
    style: { scale: 1.8 },
  },
  tent: { model: `${NATURE}/tent_detailedClosed`, fallbackModel: `${PROPS}/Tent`, style: { scale: 2.4 } },
  signpost: { model: `${PROPS}/Signpost`, fallbackModel: `${SCIFI}/crate`, style: { scale: 4 } },
  street_lamp: {
    model: `${SCIFI}/machine_wireless`,
    fallbackModel: `${SCIFI}/astronautA`,
    style: { scale: 2.6, material: { emissive: "#ffd98a", emissiveIntensity: 1 } },
  },
  road_marker: { model: `${PROPS}/Signpost`, fallbackModel: `${SCIFI}/crate`, style: { scale: 2 } },
  bus_wreck: {
    model: `${SCIFI}/craft_cargoA`,
    fallbackModel: `${SCIFI}/astronautA`,
    style: { scale: 2.45, material: { color: "#b5893a", roughness: 0.9 } },
  },
  water_tower: { model: `${SCIFI}/hangar_roundB`, fallbackModel: `${SCIFI}/astronautA`, style: { scale: 1.22 } },
  bone_arch: {
    model: `${NATURE}/statue_ring`,
    fallbackModel: `${PROPS}/Arch`,
    style: { scale: 3.2, material: { color: "#e0d6c2" } },
  },
  reactor_gate: {
    model: `${SCIFI}/hangar_roundGlass`,
    fallbackModel: `${SCIFI}/astronautA`,
    style: {
      scale: 1.6,
      material: { color: "#3a2c4a", emissive: "#c05cff", emissiveIntensity: 0.9 },
    },
  },
  cover_crate: { model: `${PROPS}/Crate`, fallbackModel: `${SCIFI}/crate`, style: { scale: 3.2 } },
  banner_pole: {
    model: `${PROPS}/Banner`,
    fallbackModel: `${SCIFI}/crate`,
    style: { scale: 3, material: { color: "#7a2c1e" } },
  },
});
