import type { ModelConfig, ModelMaterialOverride } from "@jgengine/core/game/playableGame";
import { pickModel, resolveModelPlan, type ModelPick } from "@jgengine/shell/render/resolveModel";

import { assets, FAMILY_COLORS, NPC_STYLES } from "../assets";
import { enemies, type EnemyDef } from "../entities/enemies/catalog";

type RigKind = "humanoid" | "alien" | "mech";

const BASE_HEIGHT: Record<RigKind, number> = { humanoid: 1.8, alien: 1.2, mech: 1.7 };

const CHAR = "kaykit-adventurers";
const SKEL = "kaykit-skeletons";
const SCIFI = "quaternius-modular-scifi";
const NATURE = "quaternius-stylized-nature";
const SPACE = "kaykit-space-base";

/**
 * Art plan: live Quaternius / KayKit catalog ids (soft via pickModel).
 * Prefer `model`; `fallbackModel` when the primary mesh is missing offline.
 */
const RIG_BY_ID: Record<string, { kind: RigKind; model: string; fallbackModel?: string }> = {
  psycho: { kind: "humanoid", model: `${CHAR}/Rogue`, fallbackModel: `${CHAR}/Rogue_Hooded` },
  marauder: { kind: "humanoid", model: `${CHAR}/Barbarian`, fallbackModel: `${CHAR}/Knight` },
  nomad: { kind: "mech", model: `${SPACE}/spacetruck`, fallbackModel: `${SCIFI}/Column_MetalSupport` },
  badass_psycho: { kind: "humanoid", model: `${CHAR}/Knight`, fallbackModel: `${CHAR}/Barbarian` },
  skag_pup: { kind: "alien", model: `${SCIFI}/Alien_Cyclop`, fallbackModel: `${SCIFI}/Alien_Scolitex` },
  skag: { kind: "alien", model: `${SCIFI}/Alien_Cyclop`, fallbackModel: `${SCIFI}/Alien_Oculichrysalis` },
  badass_skag: { kind: "alien", model: `${SCIFI}/Alien_Oculichrysalis`, fallbackModel: `${SCIFI}/Alien_Cyclop` },
  bullymong_brat: { kind: "alien", model: `${SCIFI}/Alien_Scolitex`, fallbackModel: `${SCIFI}/Alien_Cyclop` },
  bullymong: { kind: "alien", model: `${SCIFI}/Alien_Scolitex`, fallbackModel: `${SCIFI}/Alien_Oculichrysalis` },
  spiderant: { kind: "alien", model: `${SCIFI}/Alien_Oculichrysalis`, fallbackModel: `${SCIFI}/Alien_Scolitex` },
  spiderant_soldier: { kind: "alien", model: `${SCIFI}/Alien_Oculichrysalis`, fallbackModel: `${SCIFI}/Alien_Cyclop` },
  loader: { kind: "mech", model: `${SPACE}/drill_structure`, fallbackModel: `${SCIFI}/Column_MetalSupport` },
  loader_war: { kind: "mech", model: `${SPACE}/structure_tall`, fallbackModel: `${SPACE}/drill_structure` },
  badass_loader: { kind: "mech", model: `${SPACE}/structure_tall`, fallbackModel: `${SPACE}/lander_A` },
  bad_maw: { kind: "alien", model: `${SCIFI}/Alien_Cyclop`, fallbackModel: `${SCIFI}/Alien_Scolitex` },
  captain_rusk: { kind: "humanoid", model: `${CHAR}/Mage`, fallbackModel: `${CHAR}/Knight` },
};

const GUN_PLAN: Record<string, ModelPick> = {
  marauder: { model: `${CHAR}/axe_1handed`, fallbackModel: `${CHAR}/sword_1handed` },
  captain_rusk: { model: `${CHAR}/staff`, fallbackModel: `${CHAR}/wand` },
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
    model: `${SPACE}/lander_A`,
    fallbackModel: `${SPACE}/structure_tall`,
    style: {
      targetHeight: THE_WARRIOR_HEIGHT,
      material: { color: "#8a2f1e", metalness: 0.6, roughness: 0.35, emissive: "#ff9a00", emissiveIntensity: 0.9 },
    },
  };
  plan.bolt = {
    model: `${SCIFI}/Prop_Light_Small`,
    fallbackModel: `${SCIFI}/Column_Simple`,
    style: {
      targetHeight: 0.9,
      material: { color: "#c9a23a", emissive: "#3fc9ff", emissiveIntensity: 1.2 },
    },
  };
  plan.dr_sparx = {
    model: `${CHAR}/Mage`,
    fallbackModel: `${CHAR}/Rogue`,
    style: { targetHeight: BASE_HEIGHT.humanoid, material: { color: NPC_STYLES.dr_sparx!.coat } },
  };
  plan.rigg = {
    model: `${CHAR}/Barbarian`,
    fallbackModel: `${CHAR}/Knight`,
    style: { targetHeight: BASE_HEIGHT.humanoid, material: { color: NPC_STYLES.rigg!.coat } },
  };
  plan.gauge = {
    model: `${CHAR}/Knight`,
    fallbackModel: `${CHAR}/Barbarian`,
    style: { targetHeight: BASE_HEIGHT.humanoid, material: { color: NPC_STYLES.gauge!.coat } },
  };
  plan.reactor_hunter = {
    model: `${CHAR}/Rogue_Hooded`,
    fallbackModel: `${CHAR}/Rogue`,
    style: {
      targetHeight: BASE_HEIGHT.humanoid,
      material: { color: "#5a5a5a", metalness: 0.5, roughness: 0.4 },
    },
  };
  return resolveModelPlan(assets, plan);
}

export const entityModels: Record<string, ModelConfig> = buildEntityModels();

export const objectModels: Record<string, ModelConfig> = resolveModelPlan(assets, {
  red_chest: { model: `${SCIFI}/Prop_Chest`, fallbackModel: "dungeon/chest", style: { scale: 2.3 } },
  ammo_chest: { model: `${SCIFI}/Prop_Crate3`, fallbackModel: `${SCIFI}/Prop_Crate4`, style: { scale: 3 } },
  vendor_rigg: {
    model: `${SCIFI}/Prop_Computer`,
    fallbackModel: `${SCIFI}/Prop_AccessPoint`,
    style: { scale: 2.6, material: { emissive: "#ffb400", emissiveIntensity: 0.5 } },
  },
  vendor_zed: {
    model: `${SCIFI}/Prop_Computer`,
    fallbackModel: `${SCIFI}/Prop_ItemHolder`,
    style: { scale: 2, material: { emissive: "#e23c2e", emissiveIntensity: 0.4 } },
  },
  new_u_station: {
    model: `${SCIFI}/Prop_AccessPoint`,
    fallbackModel: `${SCIFI}/Prop_Computer`,
    style: { scale: 2.2, material: { color: "#2f8cff", emissive: "#2f8cff", emissiveIntensity: 0.8 } },
  },
  bandit_barrel: {
    model: `${SCIFI}/Prop_Barrel_Large`,
    fallbackModel: `${SCIFI}/Prop_Crate3`,
    style: { scale: 3.2, material: { color: "#b3452a", emissive: "#e2582e", emissiveIntensity: 0.2 } },
  },
  fast_travel: {
    model: `${SCIFI}/Door_Metal`,
    fallbackModel: `${SCIFI}/Door_Simple`,
    style: { scale: 2.2, material: { emissive: "#38e1ff", emissiveIntensity: 1 } },
  },
  black_market: {
    model: `${SCIFI}/Door_DarkMetal`,
    fallbackModel: `${SCIFI}/Door_Frame_Square`,
    style: { scale: 2.2, material: { emissive: "#8a2be2", emissiveIntensity: 0.6 } },
  },
  rock_spire: {
    model: `${NATURE}/Rock_Medium_1`,
    fallbackModel: `${NATURE}/Rock_Medium_2`,
    style: { scale: 4 },
  },
  dead_tree: {
    model: `${NATURE}/DeadTree_1`,
    fallbackModel: `${NATURE}/DeadTree_2`,
    style: { scale: 3 },
  },
  wreck: {
    model: `${SPACE}/cargo_A`,
    fallbackModel: `${SCIFI}/Prop_Crate4`,
    style: { scale: 1.6, material: { color: "#7a5a3a", roughness: 1 } },
  },
  barricade: {
    model: `${SCIFI}/Prop_Rail_2`,
    fallbackModel: `${SCIFI}/ShortWall_Metal2_Straight`,
    style: { scale: 2.8 },
  },
  watchtower: {
    model: `${SCIFI}/Platform_Rails_4WideTall`,
    fallbackModel: `${SCIFI}/Column_Large_Straight`,
    style: { scale: 1.8 },
  },
  tent: {
    model: `${SPACE}/structure_low`,
    fallbackModel: `${SCIFI}/Prop_Vent_Wide`,
    style: { scale: 2.4 },
  },
  signpost: {
    model: `${SCIFI}/Decal_Sign`,
    fallbackModel: `${SCIFI}/Column_Simple`,
    style: { scale: 4 },
  },
  street_lamp: {
    model: `${SCIFI}/Prop_Light_Floor`,
    fallbackModel: `${SCIFI}/Prop_Light_Small`,
    style: { scale: 2.6, material: { emissive: "#ffd98a", emissiveIntensity: 1 } },
  },
  road_marker: {
    model: `${SCIFI}/Decal_Sign`,
    fallbackModel: `${SCIFI}/Column_Simple`,
    style: { scale: 2 },
  },
  bus_wreck: {
    model: `${SPACE}/spacetruck_large`,
    fallbackModel: `${SPACE}/spacetruck`,
    style: { scale: 2.45, material: { color: "#b5893a", roughness: 0.9 } },
  },
  water_tower: {
    model: `${SPACE}/structure_tall`,
    fallbackModel: `${SCIFI}/Column_Large_Straight`,
    style: { scale: 1.22 },
  },
  bone_arch: {
    model: `${SKEL}/Skeleton_Mage`,
    fallbackModel: `${NATURE}/TwistedTree_1`,
    style: { scale: 3.2, material: { color: "#e0d6c2" } },
  },
  reactor_gate: {
    model: `${SCIFI}/Door_Frame_SquareTall`,
    fallbackModel: `${SCIFI}/Door_Frame_Square`,
    style: {
      scale: 1.6,
      material: { color: "#3a2c4a", emissive: "#c05cff", emissiveIntensity: 0.9 },
    },
  },
  cover_crate: {
    model: `${SCIFI}/Prop_Crate4`,
    fallbackModel: `${SCIFI}/Prop_Crate3`,
    style: { scale: 3.2 },
  },
  banner_pole: {
    model: `${SCIFI}/Column_Simple`,
    fallbackModel: `${SCIFI}/Column_Round`,
    style: { scale: 3, material: { color: "#7a2c1e" } },
  },
});
