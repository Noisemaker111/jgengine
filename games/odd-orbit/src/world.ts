import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { environmentContentFromDocument } from "@jgengine/core/editor/environment";
import { resolveEnvironmentField, type TerrainField } from "@jgengine/core/world/terrain";
import { environment, sky, terrain, type WorldFeature } from "@jgengine/core/world/features";

import { editorLayers } from "./editorLayers";
import { HABITAT } from "./game/palette";
import { libraryGroundMaps } from "./game/assets";

export const WORLD_SEED = "odd-orbit-habitat-2026";
export const DAY_LENGTH = 210;
export const PLOT = { minX: -26, maxX: 26, minZ: -26, maxZ: 26 } as const;
const authored = environmentContentFromDocument(editorLayers, { minBounds: { w: 240, d: 240 } });

const terrainDescriptor = terrain({
  bounds: authored.bounds,
  seed: WORLD_SEED,
  material: "rock",
  height: 14,
  frequency: 0.008,
  octaves: 4,
  colors: { low: HABITAT.groundLow, high: HABITAT.groundHigh, waterline: HABITAT.flora },
  flatten: [{ center: [0, 0], radius: 46 }],
  segments: 240,
  detail: {
    rockColor: HABITAT.rock,
    roughness: 0.96,
    strength: 0.2,
    snowHeight: 60,
    sweeps: { dry: [1.04, 1.02, 1], wet: [0.95, 0.96, 1] },
    // Regolith from the shared material library. `tint` well under 1 keeps the habitat's lilac above
    // the scan, so the floor and the ground outside gain grain instead of turning grey.
    material: { maps: libraryGroundMaps("ground/gravel"), repeat: 1.6, strength: 1, tint: 0.35 },
  },
});

export const world: WorldFeature = environment({
  terrain: terrainDescriptor,
  sculpt: authored.sculpt,
  sky: sky(authored.sky ?? {
    preset: "dusk",
    timeOfDay: true,
    horizonColor: HABITAT.horizon,
    zenithColor: HABITAT.zenith,
    sunIntensity: 1.5,
    ambientIntensity: 0.95,
    fog: { color: HABITAT.fog, near: 160, far: 900 },
  }),
});

export const terrainField: TerrainField = resolveEnvironmentField(world);

export const physics: PhysicsConfig = { gravity: -24 };
