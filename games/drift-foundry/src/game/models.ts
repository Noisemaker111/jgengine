import type { ModelConfig, ModelPart } from "@jgengine/core/game/playableGame";

import { assets } from "./assets";
import { buggyModel, ghostKartModel, jumpBarrierModel, jumpCueModel, rivalKartModels, stationModels, upgradeModels } from "./art/models";
import { trackEntityModels, trackObjectModels } from "./art/trackModels";
import { COMPACTOR_ENTITY, KART_GHOST_ENTITY, KART_PLAYER_ENTITY } from "./entities/catalog";
import {
  EXIT_GATE_ARCH,
  GATE_BARRICADE_JUMP,
  GATE_BARRICADE_PLOW,
  PICKUP_MARKER,
  JUMP_CUE,
  PROP_APPLIANCE_STACK,
  PROP_CONTAINER_STACK,
  PROP_CRANE_LEG,
  PROP_DUMPSTER,
  PROP_SCRAP_HEAP,
  PROP_STRIPPED_CAR,
  PROP_TIRE_WALL,
  PROP_WRECK_PILE,
  PROP_YARD_LAMP,
  PROP_YARD_TOWER,
} from "./objects/catalog";

const RUST = "#8a3a1e";
const OIL_BLACK = "#232019";
const HAZARD_YELLOW = "#f0c419";
const SCRAP_STEEL = "#8d99a6";
const WELD_WHITE = "#fef3e0";
const TAIL_RED = "#ff2d15";
const LAMP_AMBER = "#ffb347";

function modelWith(id: string, overrides: Partial<ModelConfig> = {}): ModelConfig {
  const base = assets.resolve(id);
  if (base === null) throw new Error(`models: unresolved asset id "${id}"`);
  return { url: base.url, dims: base.dims, ...overrides };
}

const GUNMETAL = "#59636a";
const SLAG = "#ff5a14";

/** One KayKit piece sized to a world height in metres, so a swapped pack never changes a prop's footprint. */
function sized(id: string, height: number, overrides: Partial<ModelConfig> = {}): ModelConfig {
  return modelWith(id, { targetHeight: height, ...overrides });
}

type Part = Omit<ModelPart, "model"> & { model: ModelConfig };
const at = (model: ModelConfig, position: [number, number, number], extra: Omit<ModelPart, "model" | "position"> = {}): Part => ({ ...extra, model, position });

const COMPACTOR_TILE_SPACING = 6;
const COMPACTOR_TILE_COUNT = 9;
const COMPACTOR_TILE_SPAN = COMPACTOR_TILE_SPACING * (COMPACTOR_TILE_COUNT - 1);
const COMPACTOR_WALL_HEIGHT = 24;

/** The wall's lower course: space-base structure towers in gunmetal, shoulder to shoulder. */
function compactorWallTile(index: number): Part {
  const x = -COMPACTOR_TILE_SPAN / 2 + index * COMPACTOR_TILE_SPACING;
  return at(sized("kaykit-space-base/structure_tall", COMPACTOR_WALL_HEIGHT, { material: { color: GUNMETAL, metalness: 0.55, roughness: 0.55 } }), [x, 0, 0]);
}

/** The cap course: cargo depots in rust stepped on top, so the wall reads as stacked machinery, not one slab. */
function compactorCap(index: number): Part {
  const x = -COMPACTOR_TILE_SPAN / 2 + index * COMPACTOR_TILE_SPACING;
  return at(sized("kaykit-space-base/cargodepot_A", 8, { material: { color: RUST, metalness: 0.4, roughness: 0.7 } }), [x, COMPACTOR_WALL_HEIGHT - 0.5, 0]);
}

/** The teeth: drill bits tilted into the front face, hazard-yellow so the compactor edge reads at speed. */
function compactorTooth(index: number): Part {
  const x = -COMPACTOR_TILE_SPAN / 2 + 2 + index * 5;
  return at(
    sized("kaykit-space-base/drill_structure", 5, { material: { color: HAZARD_YELLOW, emissive: HAZARD_YELLOW, emissiveIntensity: 1.2, metalness: 0.3, roughness: 0.5 } }),
    [x, 0.4, 1.1],
    { rotation: [Math.PI / 4, 0, 0] },
  );
}

function compactorLight(index: number): Part {
  const x = -COMPACTOR_TILE_SPAN / 2 + 4 + index * 9;
  return at(sized("kaykit-space-base/lights", 3.5, { material: { emissive: SLAG, emissiveIntensity: 2.6 } }), [x, 6.4, 0.6]);
}

const COMPACTOR_MODEL: ModelConfig = {
  ...compactorWallTile(0).model,
  parts: [
    ...Array.from({ length: COMPACTOR_TILE_COUNT - 1 }, (_, i) => compactorWallTile(i + 1)),
    ...Array.from({ length: COMPACTOR_TILE_COUNT }, (_, i) => compactorCap(i)),
    ...Array.from({ length: 8 }, (_, i) => compactorTooth(i)),
    ...Array.from({ length: 4 }, (_, i) => compactorLight(i)),
  ],
};

/** Scrapped cars keep their own paint — a yard of identically rust-tinted hulks reads as one prop. */
function wreckPile(main: string, tilt1: string, tilt2: string): ModelConfig {
  return sized(main, 1.1, {
    material: { roughness: 0.86, metalness: 0.22 },
    parts: [
      at(sized(tilt1, 1, { material: { roughness: 0.9, metalness: 0.2 } }), [0.5, 0.9, 0.3], { rotation: [0.35, 0.7, 0.5], scale: 0.9 }),
      at(sized(tilt2, 1.2, { material: { color: OIL_BLACK, roughness: 0.9, metalness: 0.2 } }), [-0.4, 1.35, -0.2], { rotation: [0.6, -1.1, 0.25], scale: 0.7 }),
    ],
  });
}

/** A single stripped hull with a drum and a rock rubble beside it — the yard's flat, wide silhouette between the tall stacks. */
function strippedCar(): ModelConfig {
  return sized("kaykit-city-builder/car_stationwagon", 1.6, {
    material: { roughness: 0.9, metalness: 0.2 },
    parts: [
      at(sized("kaykit-space-base/containers_A", 1, { material: { color: RUST, roughness: 0.9, metalness: 0.2 } }), [1.3, 0.5, -0.6], { rotation: [1.5, 0.3, 0] }),
      at(sized("kaykit-space-base/rocks_A", 0.9, { material: { color: OIL_BLACK, roughness: 0.95 } }), [-1.1, 0.2, 0.7], { rotation: [0, 0.9, 0] }),
    ],
  });
}

function dumpsterRow(): ModelConfig {
  return sized("kaykit-city-builder/dumpster", 2.2, {
    material: { color: "#3d4438", roughness: 0.85, metalness: 0.3 },
    parts: [
      at(modelWith("kaykit-city-builder/trash_A", { material: { color: SCRAP_STEEL, roughness: 0.9 } }), [1.9, 0, 0.5], { rotation: [0, 0.6, 0], scale: 4 }),
      at(modelWith("kaykit-city-builder/box_A", { material: { color: RUST, roughness: 0.85 } }), [-1.7, 0.4, -0.4], { rotation: [0.2, 1.1, 0.1], scale: 2.2 }),
    ],
  });
}

/** Yard floodlight — the emissive head is the vertical rhythm that sells the corridor at speed. */
function yardLamp(): ModelConfig {
  return sized("kaykit-city-builder/streetlight", 9.5, {
    material: { color: "#4a4038", metalness: 0.6, roughness: 0.5 },
    parts: [at(sized("kaykit-space-base/lights", 1.2, { material: { color: LAMP_AMBER, emissive: LAMP_AMBER, emissiveIntensity: 1.7, roughness: 0.3 } }), [1.05, 9.05, 0])],
  });
}

/** Skyline landmark: the only silhouette in the yard that is neither a box nor a stack. */
function yardTower(): ModelConfig {
  return sized("kaykit-city-builder/watertower", 17, {
    material: { color: "#6b5140", metalness: 0.5, roughness: 0.65 },
    parts: [at(sized("kaykit-space-base/lights", 1.4, { material: { color: TAIL_RED, emissive: TAIL_RED, emissiveIntensity: 1.8, roughness: 0.3 } }), [0, 17.2, 0])],
  });
}

/** A wall of drums two high: space-base containers stand in for the old barrels. */
function barrelWall(): ModelConfig {
  const drum = (x: number, y: number): Part => at(sized("kaykit-space-base/containers_C", 1.7, { material: { color: OIL_BLACK, metalness: 0.3, roughness: 0.8 } }), [x, y, 0]);
  return {
    ...drum(-1.3, 0.85).model,
    parts: [drum(-1.3, 2.4), drum(-0.4, 0.85), drum(-0.4, 2.4), drum(0.5, 0.85), drum(0.5, 2.4), drum(1.4, 0.85), drum(1.4, 2.4)],
  };
}

function applianceStack(): ModelConfig {
  return sized("kaykit-space-base/cargodepot_B", 2.4, {
    material: { color: SCRAP_STEEL, roughness: 0.5, metalness: 0.4 },
    parts: [at(sized("kaykit-space-base/cargo_B_stacked", 1.5, { material: { color: WELD_WHITE, roughness: 0.6 } }), [0.15, 1.45, 0.1], { rotation: [0.2, 0.3, 0.1] })],
  });
}

/** A heap of rock and cargo with a taxi shell wedged in its top. */
function scrapHeap(): ModelConfig {
  return sized("kaykit-space-base/rocks_B", 3, {
    material: { color: HAZARD_YELLOW, roughness: 0.8, metalness: 0.3 },
    parts: [
      at(sized("kaykit-space-base/cargo_A_packed", 1.4, { material: { color: SCRAP_STEEL, roughness: 0.9 } }), [0.4, 0.3, 0.2], { rotation: [0.3, 0.5, 0.2] }),
      at(sized("kaykit-space-base/containers_B", 1.4, { material: { color: RUST, roughness: 0.8 } }), [-0.3, 0.25, -0.15], { rotation: [0.1, 1.2, 0] }),
      at(sized("kaykit-city-builder/car_taxi", 1.4, { material: { roughness: 0.6, metalness: 0.5 } }), [0, 1.9, 0], { rotation: [0.5, 0.8, 0.9] }),
    ],
  });
}

function containerStack(): ModelConfig {
  return sized("kaykit-space-base/cargodepot_C", 5.5, {
    material: { color: RUST, roughness: 0.6, metalness: 0.35 },
    parts: [at(sized("kaykit-space-base/cargo_B_stacked", 3.6, { material: { color: SCRAP_STEEL, roughness: 0.6, metalness: 0.35 } }), [0.3, 2.6, 0], { rotation: [0, 0.3, 0] })],
  });
}

function craneLeg(): ModelConfig {
  return sized("kaykit-space-base/structure_tall", 9, {
    material: { color: HAZARD_YELLOW, roughness: 0.5, metalness: 0.4 },
    parts: [at(sized("kaykit-space-base/lights", 2.4, { material: { emissive: HAZARD_YELLOW, emissiveIntensity: 1.2 } }), [0, 9.2, 0])],
  });
}

/**
 * One tiled segment of a corridor-spanning wall: `placeGateBarricades` repeats it every
 * {@link BARRICADE_SEGMENT_WIDTH} metres, so a segment is ~8m wide and roof-height. Three
 * low structures side by side with cargo on top replace the old barrier planks.
 */
function gateBarricade(requirement: "plow" | "jump"): ModelConfig {
  const color = requirement === "plow" ? RUST : HAZARD_YELLOW;
  const slab = (x: number, rotationY: number): Part =>
    at(sized("kaykit-space-base/structure_low", 2.2, { material: { color, emissive: color, emissiveIntensity: 0.5, roughness: 0.55, metalness: 0.3 } }), [x, 0, 0], { rotation: [0, rotationY, 0] });
  return {
    ...slab(0, 0).model,
    parts: [
      slab(-2.5, 0.12),
      slab(2.5, -0.12),
      at(sized("kaykit-space-base/cargo_A_stacked", 1.6, { material: { color: OIL_BLACK, roughness: 0.9, metalness: 0.25 } }), [-3.3, 2.2, 0.2]),
      at(sized("kaykit-space-base/cargo_B_stacked", 1.6, { material: { color: SCRAP_STEEL, roughness: 0.8, metalness: 0.35 } }), [3.2, 2.2, -0.2], { rotation: [0, 0.5, 0] }),
    ],
  };
}

function exitGateArch(): ModelConfig {
  return sized("kaykit-space-base/tunnel_straight_A", 9.5, {
    material: { color: SCRAP_STEEL, roughness: 0.4, metalness: 0.5 },
    parts: [at(sized("kaykit-space-base/lights", 3.2, { material: { emissive: WELD_WHITE, emissiveIntensity: 0.8 } }), [0, 8.4, 0])],
  });
}

/** A token standing in a pylon: a bare flat disc at this scale reads as a glowing smear head-on. */
function pickupMarker(): ModelConfig {
  return sized("kaykit-space-base/containers_D", 1.5, {
    material: { color: OIL_BLACK, metalness: 0.6, roughness: 0.5 },
    parts: [at(sized("kaykit-space-base/lights", 0.9, { material: { color: WELD_WHITE, emissive: HAZARD_YELLOW, emissiveIntensity: 1.9, metalness: 0.5, roughness: 0.25 } }), [0, 1.7, 0])],
  });
}

export const entityModels: Record<string, ModelConfig> = {
  ...upgradeModels,
  ...rivalKartModels,
  [KART_PLAYER_ENTITY]: buggyModel,
  [KART_GHOST_ENTITY]: ghostKartModel,
  [COMPACTOR_ENTITY]: COMPACTOR_MODEL,
  ...trackEntityModels,
};

export const objectModels: Record<string, ModelConfig> = {
  [PROP_WRECK_PILE]: wreckPile("kaykit-city-builder/car_sedan", "kaykit-city-builder/car_taxi", "kaykit-space-base/cargo_A_stacked"),
  [PROP_TIRE_WALL]: barrelWall(),
  [PROP_APPLIANCE_STACK]: applianceStack(),
  [PROP_SCRAP_HEAP]: scrapHeap(),
  [PROP_CONTAINER_STACK]: containerStack(),
  [PROP_CRANE_LEG]: craneLeg(),
  [PROP_STRIPPED_CAR]: strippedCar(),
  [PROP_DUMPSTER]: dumpsterRow(),
  [PROP_YARD_LAMP]: yardLamp(),
  [PROP_YARD_TOWER]: yardTower(),
  [GATE_BARRICADE_PLOW]: gateBarricade("plow"),
  [GATE_BARRICADE_JUMP]: jumpBarrierModel,
  [JUMP_CUE]: jumpCueModel,
  ...stationModels,
  [PICKUP_MARKER]: pickupMarker(),
  [EXIT_GATE_ARCH]: exitGateArch(),
  ...trackObjectModels,
};

/** Gulls over the dumps: the authored habitats' species, sized to read as a bird from the road. */
export const flockModels: Record<string, ModelConfig> = {
  gull: sized("quaternius-5-low-poly-animals/bird", 1.4, { material: { color: "#ece3cc", roughness: 0.8 } }),
};
