import type { ModelConfig, ModelMaterialOverride } from "@jgengine/core/game/playableGame";
import { pickModel, resolveModelPlan, type ModelPick } from "@jgengine/shell/render/resolveModel";

import { assets, CHASSIS, CLIFF_MAPS, NPC_STYLES, PANEL_MAPS, SCRAP_METAL_MAPS } from "../assets";
import { MACHINE } from "../palette";
import { enemies, type EnemyDef } from "../entities/enemies/catalog";
import { robotChassis } from "./robots";

const CHAR = "kaykit-adventurers";
const SCIFI = "quaternius-modular-scifi";
const NATURE = "quaternius-stylized-nature";
const SPACE = "kaykit-space-base";

/**
 * Two things are deliberately *absent* from every rigged pick below.
 *
 * There is no explicit `animation` block: a catalog-resolved rig is stamped `animation: "auto"` and
 * the engine derives idle/walk/run plus hit/death/attack one-shots from the GLB's real clip names.
 * The previous hand-written config named clips no pack here has (`idle`, `walk`, `sprint`, `die`,
 * `holding-right-shoot`), and an explicit config always wins over `"auto"`. Worse, a missing state
 * clip silently falls back to the GLB's *first* clip — which on a KayKit rig is
 * `1H_Melee_Attack_Chop` — so every humanoid stood in the world looping a sword swing and never
 * played a death or a hit.
 *
 * And weapon attachments use `handslot.r`, the bone the rigs actually have. The previous `arm-right`
 * matched nothing, so the game logged one warning per enemy per frame and drew no weapons at all.
 */
const HUMANOID_HEIGHT = 1.8;
const WEAPON_BONE = "handslot.r";

type RigKind = "humanoid" | "beast" | "machine";

const BASE_HEIGHT: Record<RigKind, number> = { humanoid: 1.8, beast: 1.2, machine: 1.7 };

/**
 * Enemy casting.
 *
 * Ferralon's hostiles are machines by name ("Husk Drone", "Hauler Frame", "Loader"), but no CC0 pack
 * we ship has a rigged robot, so the cast is the closest rigged silhouette per family plus a machine
 * finish: humanoid drones on the KayKit rigs, beast-frames on the Quaternius aliens (which carry
 * their own idle clip), and the heavy loaders on sci-fi hardware.
 *
 * The loaders are the honest weak spot — `drill_structure` and friends are static scenery with no
 * rig, so a heavy frame slides rather than walks. Replacing them needs either a rigged mech pack or
 * a working rig-less part composition; see the tracked issue.
 */
const RIG_BY_ID: Record<string, { kind: RigKind; model: string; fallbackModel?: string }> = {
  psycho: { kind: "humanoid", model: `${CHAR}/Rogue`, fallbackModel: `${CHAR}/Rogue_Hooded` },
  marauder: { kind: "humanoid", model: `${CHAR}/Barbarian`, fallbackModel: `${CHAR}/Knight` },
  nomad: { kind: "machine", model: `${SPACE}/spacetruck`, fallbackModel: `${SCIFI}/Prop_Computer` },
  badass_psycho: { kind: "humanoid", model: `${CHAR}/Knight`, fallbackModel: `${CHAR}/Barbarian` },
  skag_pup: { kind: "beast", model: `${SCIFI}/Alien_Cyclop`, fallbackModel: `${SCIFI}/Alien_Scolitex` },
  skag: { kind: "beast", model: `${SCIFI}/Alien_Cyclop`, fallbackModel: `${SCIFI}/Alien_Oculichrysalis` },
  badass_skag: { kind: "beast", model: `${SCIFI}/Alien_Oculichrysalis`, fallbackModel: `${SCIFI}/Alien_Cyclop` },
  bullymong_brat: { kind: "beast", model: `${SCIFI}/Alien_Scolitex`, fallbackModel: `${SCIFI}/Alien_Cyclop` },
  bullymong: { kind: "beast", model: `${SCIFI}/Alien_Scolitex`, fallbackModel: `${SCIFI}/Alien_Oculichrysalis` },
  spiderant: { kind: "beast", model: `${SCIFI}/Alien_Oculichrysalis`, fallbackModel: `${SCIFI}/Alien_Scolitex` },
  spiderant_soldier: { kind: "beast", model: `${SCIFI}/Alien_Oculichrysalis`, fallbackModel: `${SCIFI}/Alien_Cyclop` },
  loader: { kind: "machine", model: `${SPACE}/drill_structure`, fallbackModel: `${SCIFI}/Column_MetalSupport` },
  loader_war: { kind: "machine", model: `${SPACE}/structure_tall`, fallbackModel: `${SPACE}/drill_structure` },
  badass_loader: { kind: "machine", model: `${SPACE}/structure_tall`, fallbackModel: `${SPACE}/lander_A` },
  bad_maw: { kind: "beast", model: `${SCIFI}/Alien_Cyclop`, fallbackModel: `${SCIFI}/Alien_Scolitex` },
  captain_rusk: { kind: "humanoid", model: `${CHAR}/Knight`, fallbackModel: `${CHAR}/Barbarian` },
  the_warrior: { kind: "machine", model: `${SPACE}/lander_A`, fallbackModel: `${SPACE}/structure_tall` },
};

/** Drones carry a scavenged blade; the beasts and hardware carry nothing. */
const WEAPON_PLAN: Record<string, ModelPick> = {
  marauder: { model: `${CHAR}/axe_1handed`, fallbackModel: `${CHAR}/sword_1handed` },
  badass_psycho: { model: `${CHAR}/axe_2handed`, fallbackModel: `${CHAR}/sword_2handed` },
  captain_rusk: { model: `${CHAR}/sword_2handed`, fallbackModel: `${CHAR}/axe_2handed` },
};

/**
 * Machine finish per family. Values come from {@link MACHINE}, never from the terrain hues, so an
 * enemy is never the same colour as the dirt it stands on — that hue split is what makes a
 * silhouette legible at range against open desert.
 */
function enemyFinish(def: EnemyDef, kind: RigKind): ModelMaterialOverride {
  const style = CHASSIS[def.id] ?? CHASSIS.psycho!;
  const machined = kind !== "beast";
  return {
    color: style.plate,
    // Moderate metalness: a fully metallic surface has no diffuse response, so outdoors under one
    // sun it renders as a black body with a hot rim instead of readable machined metal.
    metalness: machined ? 0.5 : 0.2,
    roughness: machined ? 0.45 : 0.75,
    ...(machined ? { maps: def.badass ? PANEL_MAPS : SCRAP_METAL_MAPS } : {}),
    // No emissive here. `ModelMaterialOverride` applies to *every* material in the model, and these
    // are single-mesh casts with no separate optic — an emissive optic colour turns the whole body
    // into a glowing lamp. Elites read through their plate colour instead (see CHASSIS).
  };
}

function enemyPick(def: EnemyDef): ModelPick | null {
  const rig = RIG_BY_ID[def.id];
  if (rig === undefined) return null;
  const weapon = WEAPON_PLAN[def.id];
  const weaponModel = weapon === undefined ? undefined : pickModel(assets, weapon);
  return {
    model: rig.model,
    fallbackModel: rig.fallbackModel,
    style: {
      targetHeight: BASE_HEIGHT[rig.kind] * def.scale,
      material: enemyFinish(def, rig.kind),
      ...(weaponModel === undefined
        ? {}
        : {
            attachments: [
              { slot: WEAPON_BONE, model: weaponModel, position: [0, -0.08, 0] as const, scale: 0.9 },
            ],
          }),
    },
  };
}

const NPC_PLAN: Record<string, ModelPick & { weapon?: ModelPick }> = {
  dr_sparx: {
    model: `${CHAR}/Mage`,
    fallbackModel: `${CHAR}/Rogue`,
    style: { targetHeight: HUMANOID_HEIGHT, material: { color: NPC_STYLES.dr_sparx!.coat } },
  },
  rigg: {
    model: `${CHAR}/Barbarian`,
    fallbackModel: `${CHAR}/Knight`,
    style: { targetHeight: HUMANOID_HEIGHT, material: { color: NPC_STYLES.rigg!.coat } },
    weapon: { model: `${CHAR}/axe_1handed`, fallbackModel: `${CHAR}/sword_1handed` },
  },
  gauge: {
    model: `${CHAR}/Knight`,
    fallbackModel: `${CHAR}/Barbarian`,
    style: { targetHeight: HUMANOID_HEIGHT, material: { color: NPC_STYLES.gauge!.coat } },
    weapon: { model: `${CHAR}/sword_1handed`, fallbackModel: `${CHAR}/axe_1handed` },
  },
  reactor_hunter: {
    model: `${CHAR}/Rogue_Hooded`,
    fallbackModel: `${CHAR}/Rogue`,
    style: {
      targetHeight: HUMANOID_HEIGHT,
      material: { color: "#5a5a5a", metalness: 0.5, roughness: 0.4 },
    },
    weapon: { model: `${CHAR}/crossbow_1handed`, fallbackModel: `${CHAR}/dagger` },
  },
};

function npcPick(plan: ModelPick & { weapon?: ModelPick }): ModelPick {
  if (plan.weapon === undefined) return plan;
  const weapon = pickModel(assets, plan.weapon);
  if (weapon === undefined) return plan;
  return {
    ...plan,
    style: {
      ...plan.style,
      attachments: [{ slot: WEAPON_BONE, model: weapon, position: [0, -0.08, 0], scale: 0.9 }],
    },
  };
}

function buildEntityModels(): Record<string, ModelConfig> {
  const enemyPlan: Record<string, ModelPick> = {};
  for (const def of enemies) {
    const pick = enemyPick(def);
    if (pick !== null) enemyPlan[def.id] = pick;
  }
  const models: Record<string, ModelConfig> = resolveModelPlan(assets, enemyPlan);

  // Loaders walk as kit-bashed part compositions; the rigged pick above stays their fallback when a
  // chassis piece is missing from the catalog.
  for (const def of enemies) {
    if (RIG_BY_ID[def.id]?.kind !== "machine") continue;
    const chassis = robotChassis(def, BASE_HEIGHT.machine * def.scale);
    if (chassis !== null) models[def.id] = chassis;
  }

  const npcPlan: Record<string, ModelPick> = {};
  for (const [id, plan] of Object.entries(NPC_PLAN)) npcPlan[id] = npcPick(plan);
  Object.assign(models, resolveModelPlan(assets, npcPlan));

  // B0-LT is a hovering repair drone, not a walker — a lamp head with no legs reads correctly.
  Object.assign(
    models,
    resolveModelPlan(assets, {
      bolt: {
        model: `${SPACE}/lights`,
        fallbackModel: `${SCIFI}/Prop_Light_Small`,
        style: {
          targetHeight: 0.9,
          y: 0.7,
          material: {
            color: MACHINE.steel,
            metalness: 0.8,
            roughness: 0.3,
            emissive: MACHINE.optic,
            emissiveIntensity: 1.6,
            maps: PANEL_MAPS,
          },
        },
      },
    }),
  );
  return models;
}

export const entityModels: Record<string, ModelConfig> = buildEntityModels();

/** Industrial props get real riveted panel; scavenged and improvised ones get scratched plate. */
const PANEL = { metalness: 0.72, roughness: 0.42, maps: PANEL_MAPS } as const;
const SCRAP = { metalness: 0.55, roughness: 0.68, maps: SCRAP_METAL_MAPS } as const;

export const objectModels: Record<string, ModelConfig> = resolveModelPlan(assets, {
  red_chest: {
    model: `${SCIFI}/Prop_Chest`,
    fallbackModel: "dungeon/chest",
    style: { scale: 2.3, material: { color: "#8f2d24", ...PANEL, emissive: "#e23c2e", emissiveIntensity: 0.35 } },
  },
  ammo_chest: {
    model: `${SCIFI}/Prop_Crate3`,
    fallbackModel: `${SCIFI}/Prop_Crate4`,
    style: { scale: 3, material: { color: MACHINE.scrap, ...SCRAP } },
  },
  vendor_rigg: {
    model: `${SCIFI}/Prop_Computer`,
    fallbackModel: `${SCIFI}/Prop_AccessPoint`,
    style: {
      scale: 2.6,
      material: { color: MACHINE.iron, ...PANEL, emissive: MACHINE.hazard, emissiveIntensity: 0.6 },
    },
  },
  vendor_zed: {
    model: `${SCIFI}/Prop_Computer`,
    fallbackModel: `${SCIFI}/Prop_ItemHolder`,
    style: {
      scale: 2,
      material: { color: MACHINE.iron, ...PANEL, emissive: "#e23c2e", emissiveIntensity: 0.5 },
    },
  },
  new_u_station: {
    model: `${SCIFI}/Prop_AccessPoint`,
    fallbackModel: `${SCIFI}/Prop_Computer`,
    style: {
      scale: 2.2,
      material: { color: MACHINE.iron, ...PANEL, emissive: "#2f8cff", emissiveIntensity: 1 },
    },
  },
  bandit_barrel: {
    model: `${SCIFI}/Prop_Barrel_Large`,
    fallbackModel: `${SCIFI}/Prop_Crate3`,
    style: { scale: 3.2, material: { color: "#b3452a", ...SCRAP, emissive: "#e2582e", emissiveIntensity: 0.25 } },
  },
  fast_travel: {
    model: `${SCIFI}/Door_Metal`,
    fallbackModel: `${SCIFI}/Door_Simple`,
    style: {
      scale: 2.2,
      material: { color: MACHINE.iron, ...PANEL, emissive: "#38e1ff", emissiveIntensity: 1.1 },
    },
  },
  black_market: {
    model: `${SCIFI}/Door_DarkMetal`,
    fallbackModel: `${SCIFI}/Door_Frame_Square`,
    style: {
      scale: 2.2,
      material: { color: "#2a1f3a", ...PANEL, emissive: "#8a2be2", emissiveIntensity: 0.7 },
    },
  },
  // Scale 4 put single boulders at building size, close enough to the camera to hide whole enemy
  // groups behind one rock. Stratified map so they carry the same layered banding as the cliffs.
  rock_spire: {
    model: `${NATURE}/Rock_Medium_1`,
    fallbackModel: `${NATURE}/Rock_Medium_2`,
    style: {
      scale: 2,
      material: { color: "#9c7a55", roughness: 0.95, metalness: 0.05, maps: CLIFF_MAPS },
    },
  },
  // No material override: the nature pack ships its own bark texture, and a flat tint over it
  // collapsed the whole trunk to an unlit black slab. Scale 3 also made every tree a frame-filling
  // black column at ground level.
  dead_tree: {
    model: `${NATURE}/DeadTree_1`,
    fallbackModel: `${NATURE}/DeadTree_2`,
    style: { scale: 1.5 },
  },
  wreck: {
    model: `${SPACE}/cargo_A`,
    fallbackModel: `${SCIFI}/Prop_Crate4`,
    style: { scale: 1.6, material: { color: MACHINE.rust, ...SCRAP } },
  },
  barricade: {
    model: `${SCIFI}/Prop_Rail_2`,
    fallbackModel: `${SCIFI}/ShortWall_Metal2_Straight`,
    style: { scale: 2.8, material: { color: MACHINE.scrap, ...SCRAP } },
  },
  watchtower: {
    model: `${SCIFI}/Platform_Rails_4WideTall`,
    fallbackModel: `${SCIFI}/Column_Large_Straight`,
    style: { scale: 1.8, material: { color: MACHINE.iron, ...PANEL } },
  },
  tent: {
    model: `${SPACE}/structure_low`,
    fallbackModel: `${SCIFI}/Prop_Vent_Wide`,
    style: { scale: 2.4, material: { color: "#6b5a42", ...SCRAP } },
  },
  signpost: {
    model: `${SCIFI}/Decal_Sign`,
    fallbackModel: `${SCIFI}/Column_Simple`,
    style: { scale: 4, material: { color: MACHINE.hazard, metalness: 0.4, roughness: 0.6 } },
  },
  street_lamp: {
    model: `${SCIFI}/Prop_Light_Floor`,
    fallbackModel: `${SCIFI}/Prop_Light_Small`,
    style: {
      scale: 2.6,
      material: { color: MACHINE.iron, ...PANEL, emissive: "#ffd98a", emissiveIntensity: 1.2 },
    },
  },
  road_marker: {
    model: `${SCIFI}/Decal_Sign`,
    fallbackModel: `${SCIFI}/Column_Simple`,
    style: { scale: 2, material: { color: MACHINE.hazard, metalness: 0.4, roughness: 0.6 } },
  },
  bus_wreck: {
    model: `${SPACE}/spacetruck_large`,
    fallbackModel: `${SPACE}/spacetruck`,
    style: { scale: 2.45, material: { color: MACHINE.rust, ...SCRAP } },
  },
  water_tower: {
    model: `${SPACE}/structure_tall`,
    fallbackModel: `${SCIFI}/Column_Large_Straight`,
    style: { scale: 1.22, material: { color: MACHINE.scrap, ...SCRAP } },
  },
  // Bleached-bone landmark: a leafless silhouette only. `TwistedTree_*` carries red autumn foliage,
  // which on an arid waste reads as a crimson canopy rather than a skeleton.
  bone_arch: {
    model: `${NATURE}/DeadTree_4`,
    fallbackModel: `${NATURE}/DeadTree_2`,
    style: { scale: 1.8 },
  },
  reactor_gate: {
    model: `${SCIFI}/Door_Frame_SquareTall`,
    fallbackModel: `${SCIFI}/Door_Frame_Square`,
    style: {
      scale: 1.6,
      material: { color: "#3a2c4a", ...PANEL, emissive: "#c05cff", emissiveIntensity: 1 },
    },
  },
  cover_crate: {
    model: `${SCIFI}/Prop_Crate4`,
    fallbackModel: `${SCIFI}/Prop_Crate3`,
    style: { scale: 3.2, material: { color: MACHINE.scrap, ...SCRAP } },
  },
  banner_pole: {
    model: `${SCIFI}/Column_Simple`,
    fallbackModel: `${SCIFI}/Column_Round`,
    style: { scale: 3, material: { color: "#7a2c1e", ...SCRAP } },
  },
});
