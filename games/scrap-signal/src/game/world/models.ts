import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { resolveModelPlan, type ModelPick } from "@jgengine/core/model/resolveModel";

import { assets, PANEL_MAPS, SCRAP_METAL_MAPS } from "../assets";
import { MACHINE } from "../palette";

const SCIFI = "quaternius-modular-scifi";
const NATURE = "quaternius-stylized-nature";
const TOON = "quaternius-toon-shooter";
const ROBOT = "quaternius-animated-lowpoly-robot";


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
 * Rim tuning for the suburb's scenery: a warm afternoon edge, weaker than the appliances' LED glow,
 * so a hedge gains form without competing with the read that says "that one can kill you".
 */
const LEAF_RIM = { color: "#fff1b8", strength: 0.35, power: 3.2 } as const;
const YARD_RIM = { color: "#ffe2a8", strength: 0.45, power: 3 } as const;

/** Utility boxes get riveted panel; curbside junk gets scratched plate. */
const PANEL = { metalness: 0.5, roughness: 0.45, maps: PANEL_MAPS } as const;
const SCRAP = { metalness: 0.4, roughness: 0.6, maps: SCRAP_METAL_MAPS } as const;

/**
 * Maple Hollow's props. The authored scene places them by catalog id, so the suburb is re-dressed
 * here: boulders became hedges, dead trees became the overgrown maples, scrap crates became moving
 * boxes and the convoy wrecks became cars abandoned in driveways. Bright paint, real leaves.
 */
export const objectModels: Record<string, ModelConfig> = resolveModelPlan(assets, {
  // A kid's toy chest, painted fire-engine red: the loot chest.
  red_chest: {
    model: `${SCIFI}/Prop_Chest`,
    fallbackModel: `${SCIFI}/Prop_Crate4`,
    style: { scale: 2.3, material: { color: "#e23c2e", metalness: 0.1, roughness: 0.5, emissive: "#ff5a3c", emissiveIntensity: 0.3 } },
  },
  // The blue recycling bin: ammo.
  ammo_chest: {
    model: `${TOON}/Trash_Container_Open`,
    fallbackModel: `${SCIFI}/Prop_Crate3`,
    style: { targetHeight: 1.3, material: { color: "#2f6fd6", metalness: 0.05, roughness: 0.6, emissive: "#2f6fd6", emissiveIntensity: 0.15 } },
  },
  // Hank's garage counter: ammo, junk of the day.
  vendor_rigg: {
    model: `${SCIFI}/Prop_Computer`,
    fallbackModel: `${SCIFI}/Prop_AccessPoint`,
    style: { scale: 2.6, material: { color: "#c94f2b", ...PANEL, emissive: "#ffb000", emissiveIntensity: 0.5 } },
  },
  // Nana's first-aid porch cabinet.
  vendor_sparx: {
    model: `${SCIFI}/Prop_Computer`,
    fallbackModel: `${SCIFI}/Prop_ItemHolder`,
    style: { scale: 2, material: { color: "#f5f0e6", ...PANEL, emissive: "#ff6b8a", emissiveIntensity: 0.45 } },
  },
  // The Lucky Gnome's shrine, where a downed tinkerer gets patched up.
  rebuild_station: {
    model: `${SCIFI}/Prop_AccessPoint`,
    fallbackModel: `${SCIFI}/Prop_Computer`,
    style: { scale: 2.2, material: { color: "#3aa84f", ...PANEL, emissive: "#7aff8a", emissiveIntensity: 0.8 } },
  },
  // A backyard propane tank. Still goes bang.
  bandit_barrel: {
    model: `${TOON}/Gas_Tank`,
    fallbackModel: `${SCIFI}/Prop_Barrel_Large`,
    style: { targetHeight: 1.4, material: { color: "#f2efe6", metalness: 0.3, roughness: 0.4, emissive: "#ff7a3c", emissiveIntensity: 0.15 } },
  },
  // The bus stop: fast travel.
  fast_travel: {
    model: `${SCIFI}/Prop_AccessPoint`,
    fallbackModel: `${SCIFI}/Prop_Computer`,
    style: { scale: 2.2, material: { color: "#ffd23f", ...PANEL, emissive: "#38c8ff", emissiveIntensity: 0.5 } },
  },
  // The swap meet table.
  black_market: {
    model: `${SCIFI}/Prop_ItemHolder`,
    fallbackModel: `${SCIFI}/Prop_Computer`,
    style: { scale: 2.2, material: { color: "#7c3aed", ...PANEL, emissive: "#ff5ad1", emissiveIntensity: 0.35 } },
  },
  // Hank's workbench: shelve, salvage, merge.
  vault: {
    model: `${SCIFI}/Prop_ItemHolder`,
    fallbackModel: `${SCIFI}/Prop_Computer`,
    style: { scale: 2.4, material: { color: "#a0662f", ...PANEL, emissive: "#ffd23f", emissiveIntensity: 0.45 } },
  },
  // Untrimmed hedges where the landscaping boulders used to be.
  rock_spire: {
    model: `${NATURE}/Bush_Common`,
    fallbackModel: `${NATURE}/Bush_Common_Flowers`,
    style: { scale: 3.2, material: { rim: LEAF_RIM } },
  },
  // The overgrown maples and oaks that took the street back.
  dead_tree: {
    model: `${NATURE}/CommonTree_1`,
    fallbackModel: `${NATURE}/CommonTree_2`,
    style: { scale: 1.6, material: { rim: LEAF_RIM } },
  },
  // A car abandoned in a driveway the day the update went out.
  wreck: {
    model: `${TOON}/Broken_Car`,
    fallbackModel: `${TOON}/Shipping_Container`,
    style: { targetHeight: 1.9, material: { rim: YARD_RIM } },
  },
  // Curbside sofas dragged into barricades.
  barricade: {
    model: `${TOON}/Sofa`,
    fallbackModel: `${TOON}/Barrier_Large`,
    style: { targetHeight: 1.5, material: { rim: YARD_RIM } },
  },
  // A treehouse lookout on stilts.
  watchtower: {
    model: `${SCIFI}/Platform_Rails_4WideTall`,
    fallbackModel: `${SCIFI}/Column_Large_Straight`,
    style: { scale: 1.8, material: { color: "#9a6b3e", metalness: 0.05, roughness: 0.8 } },
  },
  // A carport frame.
  tent: {
    model: `${TOON}/Shipping_Container_Structure`,
    fallbackModel: `${TOON}/Shipping_Container`,
    style: { targetHeight: 3.6, material: { rim: YARD_RIM } },
  },
  signpost: {
    model: `${TOON}/Sign`,
    fallbackModel: `${SCIFI}/Column_Simple`,
    style: { targetHeight: 2.2, material: { rim: YARD_RIM } },
  },
  street_lamp: {
    model: `${TOON}/Street_Light`,
    fallbackModel: `${SCIFI}/Prop_Light_Floor`,
    style: { targetHeight: 6, material: { rim: YARD_RIM } },
  },
  // Traffic cones and tyre stacks mark the routes.
  road_marker: {
    model: `${TOON}/Traffic_Cone`,
    fallbackModel: `${TOON}/Tires`,
    style: { targetHeight: 0.9, material: { rim: YARD_RIM } },
  },
  // The overturned school bus at the opening: painted school-bus yellow.
  bus_wreck: {
    model: `${TOON}/Broken_Car`,
    fallbackModel: `${TOON}/Shipping_Container`,
    style: { targetHeight: 3.2, scale: 1.6, material: { color: "#ffc20e", rim: YARD_RIM } },
  },
  water_tower: {
    model: `${TOON}/Water_Tank`,
    fallbackModel: `${SCIFI}/Column_Large_Straight`,
    style: { targetHeight: 9, material: { color: "#8fd3ff", rim: YARD_RIM } },
  },
  // Giant lawn flamingos are drawn by `renderObject`; this is only their fallback.
  bone_arch: {
    model: `${NATURE}/Flower_4_Group`,
    fallbackModel: `${NATURE}/Bush_Common_Flowers`,
    style: { scale: 3, material: { rim: LEAF_RIM } },
  },
  // The Smart Home Estates' gate: an arch lit Wi-Fi blue.
  reactor_gate: {
    model: `${SCIFI}/Door_Frame_SquareTall`,
    fallbackModel: `${SCIFI}/Door_Frame_Square`,
    style: { scale: 1.6, material: { color: "#e8ebee", ...PANEL, emissive: "#38c8ff", emissiveIntensity: 1 } },
  },
  // Moving boxes, stacked into cover.
  cover_crate: {
    model: `${TOON}/Cardboard_Boxes`,
    fallbackModel: `${SCIFI}/Prop_Crate3`,
    style: { targetHeight: 1.3, material: { rim: YARD_RIM } },
  },
  // Yard-sale signs and telephone poles are drawn by `renderObject`; these are their fallbacks.
  banner_pole: {
    model: `${SCIFI}/Column_Simple`,
    fallbackModel: `${SCIFI}/Column_Round`,
    style: { scale: 3, material: { color: "#ff5ad1", ...SCRAP } },
  },
  wind_turbine: {
    model: `${SCIFI}/Column_Astra`,
    fallbackModel: `${SCIFI}/Column_Pipes`,
    style: { targetHeight: 16, material: { color: MACHINE.steel, ...PANEL } },
  },
});
