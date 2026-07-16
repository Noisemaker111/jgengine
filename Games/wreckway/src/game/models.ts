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
  PROP_SCRAP_HEAP,
  PROP_TIRE_WALL,
  PROP_WRECK_PILE,
} from "./objects/catalog";

const RUST = "#8a3a1e";
const OIL_BLACK = "#232019";
const HAZARD_YELLOW = "#f0c419";
const SCRAP_STEEL = "#8d99a6";
const WELD_WHITE = "#fef3e0";

function modelWith(id: string, overrides: Partial<ModelConfig> = {}): ModelConfig {
  const base = assets.resolve(id);
  if (base === null) throw new Error(`models: unresolved asset id "${id}"`);
  return { url: base.url, dims: base.dims, ...overrides };
}

const KART_MODEL: ModelConfig = modelWith("kenney-racing/raceCarOrange", {
  targetHeight: 1.05,
  material: { color: RUST, metalness: 0.5, roughness: 0.55 },
  parts: [
    {
      model: modelWith("kenney-survival/barrel", {
        material: { color: RUST, metalness: 0.3, roughness: 0.85 },
      }),
      position: [-0.55, 0.68, -1.1],
      rotation: [0, 0.4, 0],
      scale: 0.5,
    },
    {
      model: modelWith("kenney-survival/metal-panel-screws", {
        material: { color: SCRAP_STEEL, metalness: 0.6, roughness: 0.4 },
      }),
      position: [0, 0.72, 1.55],
      rotation: [0.4, 0, 0],
      scale: 1.4,
    },
  ],
});

const COMPACTOR_TILE_SCALE = 6;
const COMPACTOR_TILE_COUNT = 9;
const COMPACTOR_TILE_SPAN = COMPACTOR_TILE_SCALE * (COMPACTOR_TILE_COUNT - 1);

function compactorWallTile(index: number): { model: ModelConfig; position: [number, number, number]; scale: number } {
  const x = -COMPACTOR_TILE_SPAN / 2 + index * COMPACTOR_TILE_SCALE;
  return {
    model: modelWith("kenney-racing/barrierWall", {
      material: { color: OIL_BLACK, metalness: 0.5, roughness: 0.6 },
    }),
    position: [x, 0, 0],
    scale: COMPACTOR_TILE_SCALE,
  };
}

function compactorTooth(index: number): { model: ModelConfig; position: [number, number, number]; rotation: [number, number, number]; scale: number } {
  const x = -COMPACTOR_TILE_SPAN / 2 + 2 + index * 5;
  return {
    model: modelWith("kenney-city-roads/construction-barrier", {
      material: { color: HAZARD_YELLOW, emissive: HAZARD_YELLOW, emissiveIntensity: 0.45, metalness: 0.3, roughness: 0.5 },
    }),
    position: [x, 0.4, 1.1],
    rotation: [Math.PI / 4, 0, 0],
    scale: 4,
  };
}

function compactorLight(index: number): { model: ModelConfig; position: [number, number, number]; scale: number } {
  const x = -COMPACTOR_TILE_SPAN / 2 + 4 + index * 9;
  return {
    model: modelWith("kenney-city-roads/construction-light", {
      material: { emissive: "#ff5a3c", emissiveIntensity: 1.4, color: OIL_BLACK },
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

function wreckPile(main: string, tilt1: string, tilt2: string): ModelConfig {
  return modelWith(main, {
    targetHeight: 0.85,
    material: { color: RUST, roughness: 0.85, metalness: 0.2 },
    parts: [
      {
        model: modelWith(tilt1, { material: { color: SCRAP_STEEL, roughness: 0.9, metalness: 0.2 } }),
        position: [0.5, 0.5, 0.3],
        rotation: [0.35, 0.7, 0.5],
        scale: 0.8,
      },
      {
        model: modelWith(tilt2, { material: { color: OIL_BLACK, roughness: 0.9, metalness: 0.2 } }),
        position: [-0.4, 0.85, -0.2],
        rotation: [0.6, -1.1, 0.25],
        scale: 0.7,
      },
    ],
  });
}

function barrelWall(): ModelConfig {
  const barrel = (x: number, y: number): { model: ModelConfig; position: [number, number, number]; scale: number } => ({
    model: modelWith("kenney-survival/barrel", { material: { color: OIL_BLACK, metalness: 0.3, roughness: 0.8 } }),
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
  return modelWith("kenney-survival/chest", {
    scale: 1.9,
    material: { color: SCRAP_STEEL, roughness: 0.5, metalness: 0.4 },
    parts: [
      {
        model: modelWith("kenney-survival/box", { material: { color: WELD_WHITE, roughness: 0.6 } }),
        position: [0.15, 1.45, 0.1],
        rotation: [0.2, 0.3, 0.1],
        scale: 1.5,
      },
    ],
  });
}

function scrapHeap(): ModelConfig {
  return modelWith("kenney-survival/metal-panel-screws", {
    scale: 3.2,
    material: { color: HAZARD_YELLOW, roughness: 0.8, metalness: 0.3 },
    parts: [
      {
        model: modelWith("kenney-survival/resource-stone-large", { material: { color: SCRAP_STEEL, roughness: 0.9 } }),
        position: [0.4, 0.3, 0.2],
        rotation: [0.3, 0.5, 0.2],
        scale: 1.6,
      },
      {
        model: modelWith("kenney-survival/box", { material: { color: RUST, roughness: 0.8 } }),
        position: [-0.3, 0.25, -0.15],
        rotation: [0.1, 1.2, 0],
        scale: 1.4,
      },
      {
        model: modelWith("kenney-survival/tool-axe", { material: { color: SCRAP_STEEL, roughness: 0.6, metalness: 0.5 } }),
        position: [0, 0.55, 0],
        rotation: [0.5, 0.8, 0.9],
        scale: 3,
      },
    ],
  });
}

function containerStack(): ModelConfig {
  return modelWith("kenney-survival/box-large", {
    scale: 2.6,
    material: { color: RUST, roughness: 0.6, metalness: 0.35 },
    parts: [
      {
        model: modelWith("kenney-survival/box-large-open", { material: { color: SCRAP_STEEL, roughness: 0.6, metalness: 0.35 } }),
        position: [0.3, 2.6, 0],
        rotation: [0, 0.3, 0],
        scale: 2.4,
      },
    ],
  });
}

function craneLeg(): ModelConfig {
  return modelWith("kenney-city-roads/bridge-pillar-wide", {
    targetHeight: 9,
    material: { color: HAZARD_YELLOW, roughness: 0.5, metalness: 0.4 },
    parts: [
      {
        model: modelWith("kenney-city-roads/construction-light", {
          material: { emissive: HAZARD_YELLOW, emissiveIntensity: 1.2, color: OIL_BLACK },
        }),
        position: [0, 9.2, 0],
        scale: 4,
      },
    ],
  });
}

function gateBarricade(requirement: "plow" | "jump"): ModelConfig {
  const color = requirement === "plow" ? RUST : HAZARD_YELLOW;
  const post = (x: number): { model: ModelConfig; position: [number, number, number]; scale: number } => ({
    model: modelWith("kenney-city-roads/construction-barrier", {
      material: { color, emissive: color, emissiveIntensity: 0.4, roughness: 0.5, metalness: 0.3 },
    }),
    position: [x, 1.1, 0],
    scale: 5,
  });
  return {
    ...post(-3.6).model,
    scale: 5,
    parts: [
      post(-1.2),
      post(1.2),
      post(3.6),
      {
        model: modelWith("kenney-racing/rail", {
          material: { color, emissive: color, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.4 },
        }),
        position: [0, 1.7, 0],
        scale: 9.4,
      },
    ],
  };
}

function exitGateArch(): ModelConfig {
  return modelWith("kenney-racing/overheadRoundColored", {
    scale: 9.5,
    material: { color: SCRAP_STEEL, roughness: 0.4, metalness: 0.5 },
    parts: [
      {
        model: modelWith("kenney-racing/flagCheckers", {
          material: { emissive: WELD_WHITE, emissiveIntensity: 0.8 },
        }),
        position: [0, 8.4, 0],
        scale: 4,
      },
    ],
  });
}

function pickupMarker(): ModelConfig {
  return modelWith("kenney-survival/tool-hammer", {
    scale: 6,
    material: { color: WELD_WHITE, emissive: HAZARD_YELLOW, emissiveIntensity: 1.3, metalness: 0.5, roughness: 0.25 },
  });
}

export const entityModels: Record<string, ModelConfig> = {
  [KART_PLAYER_ENTITY]: KART_MODEL,
  [COMPACTOR_ENTITY]: COMPACTOR_MODEL,
};

export const objectModels: Record<string, ModelConfig> = {
  [PROP_WRECK_PILE]: wreckPile("kenney-racing/raceCarRed", "kenney-racing/raceCarWhite", "kenney-survival/box-large-open"),
  [PROP_TIRE_WALL]: barrelWall(),
  [PROP_APPLIANCE_STACK]: applianceStack(),
  [PROP_SCRAP_HEAP]: scrapHeap(),
  [PROP_CONTAINER_STACK]: containerStack(),
  [PROP_CRANE_LEG]: craneLeg(),
  [GATE_BARRICADE_PLOW]: gateBarricade("plow"),
  [GATE_BARRICADE_JUMP]: gateBarricade("jump"),
  [PICKUP_MARKER]: pickupMarker(),
  [EXIT_GATE_ARCH]: exitGateArch(),
};
