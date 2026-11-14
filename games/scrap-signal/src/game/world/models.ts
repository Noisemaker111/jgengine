import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { resolveModelPlan, type ModelPick } from "@jgengine/core/model/resolveModel";

import { assets, CLIFF_MAPS, PANEL_MAPS, SCRAP_METAL_MAPS } from "../assets";
import { MACHINE } from "../palette";

const SCIFI = "quaternius-modular-scifi";
const NATURE = "quaternius-stylized-nature";
const TOON = "quaternius-toon-shooter";
const ROBOT = "quaternius-animated-lowpoly-robot";
const DESERT = "quaternius-low-poly-desert-assets";

/**
 * Rigged picks carry no explicit `animation`: a catalog-resolved rig is stamped `animation: "auto"`
 * and the engine derives its states and one-shots from the GLB's real clip names.
 */
const HUMANOID_HEIGHT = 1.8;

/**
 * Every gun a Toon Shooter character carries in its right hand. The pack ships them all on the rig;
 * a character shows one and hides the rest.
 */
const TOON_GUNS = [
  "Revolver", "Revolver_Small", "Pistol", "GrenadeLauncher", "ShortCannon", "Shotgun", "Sniper_2",
  "Sniper", "SMG", "RocketLauncher", "Shovel", "AK", "Knife_1", "Knife_2",
] as const;
type ToonGun = (typeof TOON_GUNS)[number];

/** Hide every gun on a Toon Shooter rig but `gun`. */
function holding(gun: ToonGun): string[] {
  return TOON_GUNS.filter((candidate) => candidate !== gun);
}

/**
 * Hostiles are not cast from a model pack: every rogue appliance is built from primitives in
 * `applianceModel.ts` and drawn through the game's `renderEntity`. Only the neighbours and DING
 * resolve models here.
 */
/** The neighbours: the Toon Shooter cast in their own colours, each holding the tool of their trade. */
const NPCS: Record<string, { body: string; gun: ToonGun }> = {
  dr_sparx: { body: `${TOON}/Character_Hazmat`, gun: "Revolver_Small" },
  rigg: { body: `${TOON}/Character_Hazmat`, gun: "Shotgun" },
  gauge: { body: `${TOON}/Character_Soldier`, gun: "Revolver" },
  reactor_hunter: { body: `${TOON}/Character_Soldier`, gun: "Sniper" },
};

function buildEntityModels(): Record<string, ModelConfig> {
  const plan: Record<string, ModelPick> = {};
  for (const [id, npc] of Object.entries(NPCS)) {
    plan[id] = { model: npc.body, style: { targetHeight: HUMANOID_HEIGHT, hiddenNodes: holding(npc.gun) } };
  }
  // DING, the guide: a video doorbell that defected, walking about on a small robot body.
  plan["bolt"] = { model: `${ROBOT}/Robot`, style: { targetHeight: 1.1, material: { rim: { color: MACHINE.optic, strength: 0.6, power: 2.8 } } } };
  return resolveModelPlan(assets, plan);
}

export const entityModels: Record<string, ModelConfig> = buildEntityModels();

/**
 * Rim tuning for the world's own scenery. Weaker and warmer than the hostiles' cool edge on purpose:
 * scenery has to gain form without competing with the read that says "that one can kill you".
 */
const BARK_RIM = { color: "#e8b06a", strength: 0.55, power: 3 } as const;
const BONE_RIM = { color: "#f2e3c4", strength: 0.7, power: 2.8 } as const;
const ROCK_RIM = { color: "#e0b47f", strength: 0.3, power: 3.6 } as const;

/** Industrial props get real riveted panel; scavenged and improvised ones get scratched plate. */
const PANEL = { metalness: 0.72, roughness: 0.42, maps: PANEL_MAPS } as const;
const SCRAP = { metalness: 0.55, roughness: 0.68, maps: SCRAP_METAL_MAPS } as const;

export const objectModels: Record<string, ModelConfig> = resolveModelPlan(assets, {
  red_chest: {
    model: `${SCIFI}/Prop_Chest`,
    fallbackModel: `${SCIFI}/Prop_Crate4`,
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
  vendor_sparx: {
    model: `${SCIFI}/Prop_Computer`,
    fallbackModel: `${SCIFI}/Prop_ItemHolder`,
    style: {
      scale: 2,
      material: { color: MACHINE.iron, ...PANEL, emissive: "#e23c2e", emissiveIntensity: 0.5 },
    },
  },
  rebuild_station: {
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
  // Doors are flat panels with no depth, so a scaled, strongly-emissive one reads as an untextured
  // slab rather than a station — which is what these two were. Every other interactive station in
  // the game is a real prop with modelled relief, so these match that vocabulary now.
  fast_travel: {
    model: `${SCIFI}/Prop_AccessPoint`,
    fallbackModel: `${SCIFI}/Prop_Computer`,
    style: {
      scale: 2.2,
      material: { color: MACHINE.iron, ...PANEL, emissive: "#38e1ff", emissiveIntensity: 0.5 },
    },
  },
  black_market: {
    model: `${SCIFI}/Prop_ItemHolder`,
    fallbackModel: `${SCIFI}/Prop_Computer`,
    style: {
      scale: 2.2,
      material: { color: "#2a1f3a", ...PANEL, emissive: "#8a2be2", emissiveIntensity: 0.3 },
    },
  },
  vault: {
    model: `${SCIFI}/Prop_ItemHolder`,
    fallbackModel: `${SCIFI}/Prop_Computer`,
    style: {
      scale: 2.4,
      material: { color: MACHINE.iron, ...PANEL, emissive: "#e0b34a", emissiveIntensity: 0.45 },
    },
  },
  // Scale 4 put single boulders at building size, close enough to the camera to hide whole enemy
  // groups behind one rock. Stratified map so they carry the same layered banding as the cliffs.
  rock_spire: {
    model: `${NATURE}/Rock_Medium_1`,
    fallbackModel: `${NATURE}/Rock_Medium_2`,
    style: {
      scale: 2,
      material: { color: "#9c7a55", roughness: 0.95, metalness: 0.05, maps: CLIFF_MAPS, rim: ROCK_RIM },
    },
  },
  // No colour override: the nature pack ships its own bark texture, and a flat tint over it
  // collapsed the whole trunk to an unlit black slab. Scale 3 also made every tree a frame-filling
  // black column at ground level.
  //
  // The rim is doing real work rather than decorating. Bark is a dark, fully-rough albedo, the key
  // is low and raking, and ambient is deliberately thin — so a backlit trunk is *correctly* almost
  // black and reads as a hole punched in the frame. A warm edge restores the form without lying
  // about the lighting or lifting the whole scene's ambient to rescue one prop.
  dead_tree: {
    model: `${NATURE}/DeadTree_1`,
    fallbackModel: `${NATURE}/DeadTree_2`,
    style: { scale: 1.5, material: { rim: BARK_RIM } },
  },
  wreck: {
    model: `${TOON}/Shipping_Container`,
    fallbackModel: `${TOON}/Container_Small`,
    style: { targetHeight: 2.6, material: { rim: BARK_RIM } },
  },
  barricade: {
    model: `${TOON}/Barrier_Large`,
    fallbackModel: `${TOON}/Barrier_Fixed`,
    style: { targetHeight: 2.4, material: { rim: BARK_RIM } },
  },
  watchtower: {
    model: `${SCIFI}/Platform_Rails_4WideTall`,
    fallbackModel: `${SCIFI}/Column_Large_Straight`,
    style: { scale: 1.8, material: { color: MACHINE.iron, ...PANEL } },
  },
  tent: {
    model: `${TOON}/Shipping_Container_Structure`,
    fallbackModel: `${TOON}/Shipping_Container`,
    style: { targetHeight: 3.6, material: { rim: BARK_RIM } },
  },
  // A standing roadside sign reads from any angle; a flat decal lay on the sand unseen.
  signpost: {
    model: `${TOON}/Sign`,
    fallbackModel: `${SCIFI}/Column_Simple`,
    style: { targetHeight: 2.2, material: { rim: BARK_RIM } },
  },
  street_lamp: {
    model: `${TOON}/Street_Light`,
    fallbackModel: `${SCIFI}/Prop_Light_Floor`,
    style: { targetHeight: 6, material: { rim: BARK_RIM } },
  },
  road_marker: {
    model: `${SCIFI}/Decal_Sign`,
    fallbackModel: `${SCIFI}/Column_Simple`,
    style: { scale: 2, material: { color: MACHINE.hazard, metalness: 0.4, roughness: 0.6 } },
  },
  bus_wreck: {
    model: `${TOON}/Broken_Car`,
    fallbackModel: `${TOON}/Shipping_Container`,
    style: { targetHeight: 4.2, material: { rim: BARK_RIM } },
  },
  water_tower: {
    model: `${TOON}/Water_Tank`,
    fallbackModel: `${SCIFI}/Column_Large_Straight`,
    style: { targetHeight: 9, material: { rim: BARK_RIM } },
  },
  // Bleached-bone landmark: a beast's skeleton half sunk in the sand.
  bone_arch: {
    model: `${DESERT}/Bones`,
    fallbackModel: `${NATURE}/DeadTree_4`,
    style: { targetHeight: 3.2, material: { rim: BONE_RIM } },
  },
  reactor_gate: {
    model: `${SCIFI}/Door_Frame_SquareTall`,
    fallbackModel: `${SCIFI}/Door_Frame_Square`,
    style: {
      scale: 1.6,
      material: { color: "#3a2c4a", ...PANEL, emissive: "#c05cff", emissiveIntensity: 1 },
    },
  },
  // Albedo maps multiply under the tint, so a mid-grey tint over a mid-grey map lands near black —
  // these crates were reading as charcoal cubes. Tint high to let the scrap map carry the value.
  cover_crate: {
    model: `${SCIFI}/Prop_Crate4`,
    fallbackModel: `${SCIFI}/Prop_Crate3`,
    style: { scale: 3.2, material: { color: "#cdd6de", ...SCRAP } },
  },
  // Brighter rust + a warm rim: the old #7a2c1e column went full black when backlit — these were
  // the featureless "monoliths" standing around the rustflat.
  banner_pole: {
    model: `${SCIFI}/Column_Simple`,
    fallbackModel: `${SCIFI}/Column_Round`,
    style: {
      scale: 3,
      material: { color: "#a8502c", ...SCRAP, rim: { color: "#ffb46a", strength: 0.5, power: 3 } },
    },
  },
  // Tall verticals for ridgelines and story clusters — an antenna mast reads at two kilometres
  // and gives the eye a destination the smooth dunes never offered.
  wind_turbine: {
    model: `${SCIFI}/Column_Astra`,
    fallbackModel: `${SCIFI}/Column_Pipes`,
    style: { targetHeight: 16, material: { color: MACHINE.steel, ...PANEL } },
  },
});
