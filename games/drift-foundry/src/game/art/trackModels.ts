import { libraryModel, libraryModelCredits } from "@jgengine/assets/catalogs/modelLibrary";
import type { ModelConfig } from "@jgengine/core/game/playableGame";

import { assets } from "../assets";
import { FREIGHT_CAR_ENTITY } from "../entities/catalog";
import { TRACK_OBJECT } from "../objects/catalog";

/**
 * The yard tracks' dressing: real-size scans from the engine's model library for the edges, lamps and
 * clutter, and KayKit composites for the set-pieces the library has no scan of (the slag vents, the
 * ladle, the belts, the freight). Names (not files) are the contract; `bun run provision drift-foundry`
 * pulls every library name below, and the credits list follows from the same names.
 */
/** Library scans by object id, each sized to the height it stands at on the track (metres). */
const LIBRARY_OBJECTS: Partial<Record<(typeof TRACK_OBJECT)[keyof typeof TRACK_OBJECT], { name: string; height: number; material?: ModelConfig["material"] }>> = {
  [TRACK_OBJECT.edgeBarrier]: { name: "city/road-barrier", height: 1.1 },
  [TRACK_OBJECT.edgeBarrel]: { name: "industrial/barrel", height: 1.2 },
  [TRACK_OBJECT.edgeTyre]: { name: "survival/tyre", height: 1 },
  [TRACK_OBJECT.edgeBoulder]: { name: "nature/rock", height: 1.4 },
  [TRACK_OBJECT.lampSearch]: { name: "scifi/searchlight", height: 2.2 },
  [TRACK_OBJECT.lampStreet]: { name: "city/street-lamp", height: 6.2, material: { emissive: "#ffcf94", emissiveIntensity: 0.9, materials: ["street_lamp_01_glass"] } },
  [TRACK_OBJECT.pipes]: { name: "industrial/pipes", height: 2.6 },
  [TRACK_OBJECT.generator]: { name: "industrial/generator", height: 1.4 },
  [TRACK_OBJECT.propane]: { name: "industrial/propane-tank", height: 1.3 },
  [TRACK_OBJECT.compressor]: { name: "industrial/compressor", height: 1.8 },
  [TRACK_OBJECT.rack]: { name: "industrial/metal-rack", height: 2.4 },
  [TRACK_OBJECT.powerBox]: { name: "industrial/power-box", height: 1.4 },
  [TRACK_OBJECT.crate]: { name: "industrial/wooden-crate", height: 1 },
  [TRACK_OBJECT.militaryCrate]: { name: "industrial/military-crate", height: 0.7 },
  [TRACK_OBJECT.boulder]: { name: "nature/boulder", height: 3.5 },
  [TRACK_OBJECT.rock]: { name: "nature/rock", height: 2 },
  [TRACK_OBJECT.barrelStove]: { name: "survival/barrel-stove", height: 1.1 },
  [TRACK_OBJECT.coveredCar]: { name: "city/covered-car", height: 1.4 },
  [TRACK_OBJECT.cabinet]: { name: "city/utility-cabinet", height: 1.3 },
};

export const TRACK_LIBRARY_NAMES: readonly string[] = [...new Set(Object.values(LIBRARY_OBJECTS).map((entry) => entry!.name))];

/** One credit line per library model the tracks use: title, author, license and source page. */
export const TRACK_LIBRARY_CREDITS: readonly string[] = libraryModelCredits(TRACK_LIBRARY_NAMES);

const OIL_BLACK = "#232019";
const SLAG_ORANGE = "#ff5a14";
const HAZARD_YELLOW = "#f0c419";
const STEEL = "#8d99a6";
const RUST = "#8a3a1e";
const SIGNAL_RED = "#ff2d15";

function kit(id: string, overrides: Partial<ModelConfig> = {}): ModelConfig {
  const base = assets.resolve(id);
  if (base === null) throw new Error(`trackModels: unresolved asset id "${id}"`);
  return { url: base.url, dims: base.dims, ...overrides };
}

// Part offsets are metres under the entity's transform; a parent's own `scale` sizes only its mesh.

/** A crusted vent the slag spurts from: a black drum with a molten throat. */
function slagVent(): ModelConfig {
  return kit("kaykit-dungeon/barrel_large", {
    scale: 1.4,
    material: { color: OIL_BLACK, roughness: 0.9, metalness: 0.2 },
    parts: [
      { model: kit("kaykit-dungeon/floor_tile_grate", { material: { color: SLAG_ORANGE, emissive: SLAG_ORANGE, emissiveIntensity: 2.4 } }), position: [0, 2.85, 0], scale: 0.5 },
      { model: kit("kaykit-dungeon/rubble_half", { material: { color: "#2a1a12", roughness: 1 } }), position: [1.2, 0, 0.6], scale: 0.5 },
    ],
  });
}

/** The ladle on its stand: a tipped steel bucket glowing at the lip, the slag river's landmark. */
function ladle(): ModelConfig {
  return kit("kaykit-dungeon/pillar", {
    scale: 2,
    material: { color: STEEL, roughness: 0.55, metalness: 0.6 },
    parts: [
      { model: kit("kaykit-dungeon/barrel_large", { material: { color: RUST, roughness: 0.7, metalness: 0.4 } }), position: [0, 8, 0.6], rotation: [0.6, 0, 0], scale: 2 },
      { model: kit("kaykit-dungeon/floor_tile_grate", { material: { color: SLAG_ORANGE, emissive: SLAG_ORANGE, emissiveIntensity: 3 } }), position: [0, 10.9, 2.6], rotation: [0.6, 0, 0], scale: 0.7 },
    ],
  });
}

/** The smelter: a rust stack with a molten mouth at its base. */
function furnace(): ModelConfig {
  return kit("kaykit-city-builder/watertower", {
    scale: 25,
    material: { color: RUST, roughness: 0.75, metalness: 0.35 },
    parts: [
      { model: kit("kaykit-dungeon/wall_arched", { material: { color: OIL_BLACK, emissive: SLAG_ORANGE, emissiveIntensity: 0.9 } }), position: [0, 0, 6.6], scale: 2 },
    ],
  });
}

/** Level-crossing post: a signal head that reads red from down the road, and its striped arm. */
function crossing(): ModelConfig {
  return kit("kaykit-city-builder/trafficlight_A", {
    scale: 6,
    material: { color: "#30333a", emissive: SIGNAL_RED, emissiveIntensity: 0.9 },
    parts: [{ model: kit("kaykit-dungeon/barrier_half", { material: { color: HAZARD_YELLOW, roughness: 0.5 } }), position: [0.5, 0, 0], scale: 1.4 }],
  });
}

function gantryLeg(): ModelConfig {
  return kit("kaykit-dungeon/pillar", {
    scale: 3,
    material: { color: HAZARD_YELLOW, roughness: 0.5, metalness: 0.45 },
    parts: [{ model: kit("kaykit-dungeon/torch_lit", { material: { emissive: HAZARD_YELLOW, emissiveIntensity: 1.4, color: OIL_BLACK } }), position: [0, 12.4, 0], scale: 2 }],
  });
}

/** A belt section: an 8 m square of black rubber on grates, laid flat in the road. */
function belt(): ModelConfig {
  return kit("kaykit-dungeon/floor_tile_extralarge_grates", { material: { color: "#15171b", roughness: 0.85, metalness: 0.3 } });
}

function signalBox(): ModelConfig {
  return kit("kaykit-city-builder/trafficlight_C", { scale: 4.5, material: { color: "#2b3a46", emissive: "#3cff7a", emissiveIntensity: 0.5 } });
}

/** The quarry's pump rig: a compressor beside its riser pipes and a steel post. */
function pumpRig(): ModelConfig {
  return {
    ...libraryModel(LIBRARY_OBJECTS[TRACK_OBJECT.compressor]!.name, { targetHeight: 3 }),
    parts: [
      { model: libraryModel(LIBRARY_OBJECTS[TRACK_OBJECT.pipes]!.name, { targetHeight: 3.4 }), position: [2.6, 0, 0] },
      { model: kit("kaykit-dungeon/pillar", { material: { color: HAZARD_YELLOW, metalness: 0.4 } }), position: [-2.2, 0, 0], scale: 1 },
    ],
  };
}

/** A steel guard rail section for the rail yard's edges. */
function edgeRail(): ModelConfig {
  return kit("kaykit-dungeon/barrier", { material: { color: STEEL, roughness: 0.45, metalness: 0.7 } });
}

/** The freight: five rusted box sections, a 17 m wagon that fills a crossing, with a red tail lamp. */
const WAGON_BOX = 3.45;
const FREIGHT_CAR: ModelConfig = kit("kaykit-dungeon/box_large", {
  scale: 2.3,
  material: { color: "#5b2a1a", roughness: 0.7, metalness: 0.35 },
  parts: [
    ...[-2, -1, 1, 2].map((i) => ({ model: kit("kaykit-dungeon/box_large", { material: { color: i % 2 === 0 ? "#5b2a1a" : "#6b3420", roughness: 0.7, metalness: 0.35 } }), position: [0, 0, i * WAGON_BOX] as [number, number, number], scale: 2.3 })),
    { model: kit("kaykit-dungeon/torch_lit", { material: { emissive: SIGNAL_RED, emissiveIntensity: 2.4, color: OIL_BLACK } }), position: [0, 2.4, 2.5 * WAGON_BOX + 0.1], scale: 1.2 },
  ],
});

export const trackObjectModels: Record<string, ModelConfig> = {
  ...Object.fromEntries(
    Object.entries(LIBRARY_OBJECTS).map(([id, entry]) => {
      const model = libraryModel(entry!.name, { targetHeight: entry!.height });
      return [id, entry!.material === undefined ? model : { ...model, material: entry!.material }];
    }),
  ),
  [TRACK_OBJECT.edgeRail]: edgeRail(),
  [TRACK_OBJECT.slagVent]: slagVent(),
  [TRACK_OBJECT.ladle]: ladle(),
  [TRACK_OBJECT.furnace]: furnace(),
  [TRACK_OBJECT.crossing]: crossing(),
  [TRACK_OBJECT.gantryLeg]: gantryLeg(),
  [TRACK_OBJECT.belt]: belt(),
  [TRACK_OBJECT.signalBox]: signalBox(),
  [TRACK_OBJECT.pumpRig]: pumpRig(),
};

export const trackEntityModels: Record<string, ModelConfig> = {
  [FREIGHT_CAR_ENTITY]: FREIGHT_CAR,
};
