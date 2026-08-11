import type { ModelConfig } from "@jgengine/core/game/playableGame";

import { assets } from "./assets";
import { COMPACTOR_ENTITY, KART_PLAYER_ENTITY } from "./entities/catalog";
import {
  EXIT_GATE_ARCH,
  GATE_BARRICADE_JUMP,
  GATE_BARRICADE_PLOW,
  PICKUP_MARKER,
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

function tailLight(x: number): { model: ModelConfig; position: [number, number, number]; rotation: [number, number, number]; scale: number } {
  return {
    model: modelWith("kaykit-dungeon/coin", {
      material: { color: TAIL_RED, emissive: TAIL_RED, emissiveIntensity: 2.6, roughness: 0.3, metalness: 0.2 },
    }),
    position: [x, 0.66, -1.36],
    rotation: [Math.PI / 2, 0, 0],
    scale: 0.75,
  };
}

/**
 * The whole car shares one KayKit atlas material, so a blanket `color` tints painted panel, glass,
 * chrome rim, and black tyre to the same value — which is what made the kart read as one brick.
 * The base keeps its own atlas; every bolted-on piece carries the scrap palette instead.
 */
const KART_MODEL: ModelConfig = modelWith("kaykit-city-builder/car_hatchback", {
  targetHeight: 1.18,
  material: {
    metalness: 0.3,
    roughness: 0.62,
    rim: { color: "#ffb066", strength: 0.5, power: 2.2 },
  },
  parts: [
    {
      model: modelWith("kaykit-dungeon/barrier", {
        material: { color: OIL_BLACK, metalness: 0.6, roughness: 0.5 },
      }),
      position: [0, 0.3, 1.5],
      rotation: [-0.3, 0, 0],
      scale: 0.5,
    },
    {
      model: modelWith("kaykit-dungeon/barrier", {
        material: { color: OIL_BLACK, metalness: 0.4, roughness: 0.75 },
      }),
      position: [-0.72, 0.3, -0.1],
      rotation: [0, Math.PI / 2, 0],
      scale: 0.34,
    },
    {
      model: modelWith("kaykit-dungeon/barrier", {
        material: { color: OIL_BLACK, metalness: 0.4, roughness: 0.75 },
      }),
      position: [0.72, 0.3, -0.1],
      rotation: [0, Math.PI / 2, 0],
      scale: 0.34,
    },
    {
      model: modelWith("kaykit-city-builder/box_B", {
        material: { color: RUST, metalness: 0.4, roughness: 0.78 },
      }),
      position: [0.14, 1.14, -0.18],
      rotation: [0.1, 0.42, 0.06],
      scale: 3.4,
    },
    {
      model: modelWith("kaykit-dungeon/barrel_small", {
        material: { color: OIL_BLACK, metalness: 0.35, roughness: 0.88 },
      }),
      position: [-0.5, 0.34, -1.12],
      rotation: [0, 0.4, 0],
      scale: 0.52,
    },
    {
      model: modelWith("kaykit-dungeon/column", {
        material: { color: OIL_BLACK, metalness: 0.7, roughness: 0.5 },
      }),
      position: [0.46, 0.9, -0.95],
      rotation: [0.18, 0, 0.1],
      scale: 0.34,
    },
    {
      model: modelWith("kaykit-dungeon/coin", {
        material: { color: "#ff7a2b", emissive: "#ff7a2b", emissiveIntensity: 2.4, roughness: 0.4 },
      }),
      position: [0.5, 1.38, -0.87],
      scale: 0.7,
    },
    tailLight(-0.44),
    tailLight(0.44),
  ],
});

const COMPACTOR_TILE_SCALE = 6;
const COMPACTOR_TILE_COUNT = 9;
const COMPACTOR_TILE_SPAN = COMPACTOR_TILE_SCALE * (COMPACTOR_TILE_COUNT - 1);

function compactorWallTile(index: number): { model: ModelConfig; position: [number, number, number]; scale: number } {
  const x = -COMPACTOR_TILE_SPAN / 2 + index * COMPACTOR_TILE_SCALE;
  return {
    model: modelWith("kaykit-dungeon/wall", {
      material: { color: OIL_BLACK, metalness: 0.5, roughness: 0.6 },
    }),
    position: [x, 0, 0],
    scale: COMPACTOR_TILE_SCALE,
  };
}

function compactorTooth(index: number): { model: ModelConfig; position: [number, number, number]; rotation: [number, number, number]; scale: number } {
  const x = -COMPACTOR_TILE_SPAN / 2 + 2 + index * 5;
  return {
    model: modelWith("kaykit-dungeon/barrier", {
      material: { color: HAZARD_YELLOW, emissive: HAZARD_YELLOW, emissiveIntensity: 1.5, metalness: 0.3, roughness: 0.5 },
    }),
    position: [x, 0.4, 1.1],
    rotation: [Math.PI / 4, 0, 0],
    scale: 4,
  };
}

function compactorLight(index: number): { model: ModelConfig; position: [number, number, number]; scale: number } {
  const x = -COMPACTOR_TILE_SPAN / 2 + 4 + index * 9;
  return {
    model: modelWith("kaykit-dungeon/torch_lit", {
      material: { emissive: "#ff5a3c", emissiveIntensity: 2.6, color: OIL_BLACK },
    }),
    position: [x, 6.4, 0.6],
    scale: 3.5,
  };
}

const COMPACTOR_MODEL: ModelConfig = {
  ...compactorWallTile(0).model,
  scale: COMPACTOR_TILE_SCALE,
  parts: [
    ...Array.from({ length: COMPACTOR_TILE_COUNT - 1 }, (_, i) => compactorWallTile(i + 1)),
    ...Array.from({ length: 8 }, (_, i) => compactorTooth(i)),
    ...Array.from({ length: 4 }, (_, i) => compactorLight(i)),
  ],
};

/** Scrapped cars keep their own paint — a yard of identically rust-tinted hulks reads as one prop. */
function wreckPile(main: string, tilt1: string, tilt2: string): ModelConfig {
  return modelWith(main, {
    targetHeight: 1.1,
    material: { roughness: 0.86, metalness: 0.22 },
    parts: [
      {
        model: modelWith(tilt1, { targetHeight: 1, material: { roughness: 0.9, metalness: 0.2 } }),
        position: [0.5, 0.9, 0.3],
        rotation: [0.35, 0.7, 0.5],
        scale: 0.9,
      },
      {
        model: modelWith(tilt2, { material: { color: OIL_BLACK, roughness: 0.9, metalness: 0.2 } }),
        position: [-0.4, 1.35, -0.2],
        rotation: [0.6, -1.1, 0.25],
        scale: 0.7,
      },
    ],
  });
}

/** A single stripped hull on its side — the yard's flat, wide silhouette between the tall stacks. */
function strippedCar(): ModelConfig {
  return modelWith("kaykit-city-builder/car_stationwagon", {
    targetHeight: 1.6,
    material: { roughness: 0.9, metalness: 0.2 },
    parts: [
      {
        model: modelWith("kaykit-dungeon/barrel_small", {
          material: { color: RUST, roughness: 0.9, metalness: 0.2 },
        }),
        position: [1.3, 0.5, -0.6],
        rotation: [1.5, 0.3, 0],
        scale: 1,
      },
      {
        model: modelWith("kaykit-dungeon/rubble_half", {
          material: { color: OIL_BLACK, roughness: 0.95 },
        }),
        position: [-1.1, 0.2, 0.7],
        rotation: [0, 0.9, 0],
        scale: 0.5,
      },
    ],
  });
}

function dumpsterRow(): ModelConfig {
  return modelWith("kaykit-city-builder/dumpster", {
    targetHeight: 2.2,
    material: { color: "#3d4438", roughness: 0.85, metalness: 0.3 },
    parts: [
      {
        model: modelWith("kaykit-city-builder/trash_A", { material: { color: SCRAP_STEEL, roughness: 0.9 } }),
        position: [1.9, 0, 0.5],
        rotation: [0, 0.6, 0],
        scale: 4,
      },
      {
        model: modelWith("kaykit-city-builder/box_A", { material: { color: RUST, roughness: 0.85 } }),
        position: [-1.7, 0.4, -0.4],
        rotation: [0.2, 1.1, 0.1],
        scale: 2.2,
      },
    ],
  });
}

/** Yard floodlight — the emissive head is the vertical rhythm that sells the corridor at speed. */
function yardLamp(): ModelConfig {
  return modelWith("kaykit-city-builder/streetlight", {
    targetHeight: 9.5,
    material: { color: "#4a4038", metalness: 0.6, roughness: 0.5 },
    parts: [
      {
        model: modelWith("kaykit-dungeon/coin", {
          material: { color: LAMP_AMBER, emissive: LAMP_AMBER, emissiveIntensity: 1.7, roughness: 0.3 },
        }),
        position: [1.05, 9.05, 0],
        scale: 2.4,
      },
    ],
  });
}

/** Skyline landmark: the only silhouette in the yard that is neither a box nor a stack. */
function yardTower(): ModelConfig {
  return modelWith("kaykit-city-builder/watertower", {
    targetHeight: 17,
    material: { color: "#6b5140", metalness: 0.5, roughness: 0.65 },
    parts: [
      {
        model: modelWith("kaykit-dungeon/coin", {
          material: { color: TAIL_RED, emissive: TAIL_RED, emissiveIntensity: 1.8, roughness: 0.3 },
        }),
        position: [0, 17.2, 0],
        scale: 1.6,
      },
    ],
  });
}

function barrelWall(): ModelConfig {
  const barrel = (x: number, y: number): { model: ModelConfig; position: [number, number, number]; scale: number } => ({
    model: modelWith("kaykit-dungeon/barrel_small", { material: { color: OIL_BLACK, metalness: 0.3, roughness: 0.8 } }),
    position: [x, y, 0],
    scale: 1.7,
  });
  return {
    ...barrel(-1.3, 0.85).model,
    scale: 1.7,
    parts: [
      barrel(-1.3, 2.4),
      barrel(-0.4, 0.85),
      barrel(-0.4, 2.4),
      barrel(0.5, 0.85),
      barrel(0.5, 2.4),
      barrel(1.4, 0.85),
      barrel(1.4, 2.4),
    ],
  };
}

function applianceStack(): ModelConfig {
  return modelWith("kaykit-dungeon/chest", {
    scale: 1.9,
    material: { color: SCRAP_STEEL, roughness: 0.5, metalness: 0.4 },
    parts: [
      {
        model: modelWith("kaykit-dungeon/box_small", { material: { color: WELD_WHITE, roughness: 0.6 } }),
        position: [0.15, 1.45, 0.1],
        rotation: [0.2, 0.3, 0.1],
        scale: 1.5,
      },
    ],
  });
}

function scrapHeap(): ModelConfig {
  return modelWith("kaykit-city-builder/box_B", {
    scale: 3.2,
    material: { color: HAZARD_YELLOW, roughness: 0.8, metalness: 0.3 },
    parts: [
      {
        model: modelWith("kaykit-dungeon/rubble_large", { material: { color: SCRAP_STEEL, roughness: 0.9 } }),
        position: [0.4, 0.3, 0.2],
        rotation: [0.3, 0.5, 0.2],
        scale: 1.6,
      },
      {
        model: modelWith("kaykit-dungeon/box_small", { material: { color: RUST, roughness: 0.8 } }),
        position: [-0.3, 0.25, -0.15],
        rotation: [0.1, 1.2, 0],
        scale: 1.4,
      },
      {
        model: modelWith("kaykit-dungeon/sword_shield", { material: { color: SCRAP_STEEL, roughness: 0.6, metalness: 0.5 } }),
        position: [0, 0.55, 0],
        rotation: [0.5, 0.8, 0.9],
        scale: 3,
      },
    ],
  });
}

function containerStack(): ModelConfig {
  return modelWith("kaykit-dungeon/crates_stacked", {
    scale: 2.6,
    material: { color: RUST, roughness: 0.6, metalness: 0.35 },
    parts: [
      {
        model: modelWith("kaykit-dungeon/box_large", { material: { color: SCRAP_STEEL, roughness: 0.6, metalness: 0.35 } }),
        position: [0.3, 2.6, 0],
        rotation: [0, 0.3, 0],
        scale: 2.4,
      },
    ],
  });
}

function craneLeg(): ModelConfig {
  return modelWith("kaykit-dungeon/pillar", {
    targetHeight: 9,
    material: { color: HAZARD_YELLOW, roughness: 0.5, metalness: 0.4 },
    parts: [
      {
        model: modelWith("kaykit-dungeon/torch_lit", {
          material: { emissive: HAZARD_YELLOW, emissiveIntensity: 1.2, color: OIL_BLACK },
        }),
        position: [0, 9.2, 0],
        scale: 2.2,
      },
    ],
  });
}

/**
 * One tiled segment of a corridor-spanning wall: `placeGateBarricades` repeats it every
 * {@link BARRICADE_SEGMENT_WIDTH} metres, so a segment is ~8m wide and roof-height — at the old
 * scale a single prop was 20m wide and 10m tall and read as a yellow overpass.
 */
function gateBarricade(requirement: "plow" | "jump"): ModelConfig {
  const color = requirement === "plow" ? RUST : HAZARD_YELLOW;
  return modelWith("kaykit-dungeon/barrier", {
    scale: 2,
    material: { color, emissive: color, emissiveIntensity: 0.5, roughness: 0.55, metalness: 0.3 },
    parts: [
      {
        model: modelWith("kaykit-dungeon/barrier_half", {
          material: { color, emissive: color, emissiveIntensity: 0.6, roughness: 0.45, metalness: 0.4 },
        }),
        position: [-2, 2.15, 0.12],
        scale: 1.6,
      },
      {
        model: modelWith("kaykit-dungeon/barrier_half", {
          material: { color, emissive: color, emissiveIntensity: 0.6, roughness: 0.45, metalness: 0.4 },
        }),
        position: [2, 2.15, -0.12],
        rotation: [0, 0.12, 0],
        scale: 1.6,
      },
      {
        model: modelWith("kaykit-dungeon/barrel_small", {
          material: { color: OIL_BLACK, roughness: 0.9, metalness: 0.25 },
        }),
        position: [-3.3, 0, 0.5],
        scale: 1.2,
      },
      {
        model: modelWith("kaykit-dungeon/box_large", {
          material: { color: SCRAP_STEEL, roughness: 0.8, metalness: 0.35 },
        }),
        position: [3.2, 0, -0.5],
        rotation: [0, 0.5, 0],
        scale: 1.1,
      },
    ],
  });
}

function exitGateArch(): ModelConfig {
  return modelWith("kaykit-dungeon/wall_arched", {
    scale: 9.5,
    material: { color: SCRAP_STEEL, roughness: 0.4, metalness: 0.5 },
    parts: [
      {
        model: modelWith("kaykit-dungeon/banner_patternA_white", {
          material: { emissive: WELD_WHITE, emissiveIntensity: 0.8 },
        }),
        position: [0, 8.4, 0],
        scale: 4,
      },
    ],
  });
}

/** A token standing in a pylon: a bare flat disc at this scale reads as a glowing smear head-on. */
function pickupMarker(): ModelConfig {
  return modelWith("kaykit-dungeon/column", {
    targetHeight: 1.5,
    material: { color: OIL_BLACK, metalness: 0.6, roughness: 0.5 },
    parts: [
      {
        model: modelWith("kaykit-dungeon/coin", {
          material: { color: WELD_WHITE, emissive: HAZARD_YELLOW, emissiveIntensity: 1.9, metalness: 0.5, roughness: 0.25 },
        }),
        position: [0, 2.2, 0],
        rotation: [Math.PI / 2, 0, 0],
        scale: 2.6,
      },
    ],
  });
}

export const entityModels: Record<string, ModelConfig> = {
  [KART_PLAYER_ENTITY]: KART_MODEL,
  [COMPACTOR_ENTITY]: COMPACTOR_MODEL,
};

export const objectModels: Record<string, ModelConfig> = {
  [PROP_WRECK_PILE]: wreckPile("kaykit-city-builder/car_sedan", "kaykit-city-builder/car_taxi", "kaykit-dungeon/box_large"),
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
  [GATE_BARRICADE_JUMP]: gateBarricade("jump"),
  [PICKUP_MARKER]: pickupMarker(),
  [EXIT_GATE_ARCH]: exitGateArch(),
};
