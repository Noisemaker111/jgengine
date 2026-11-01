import { windField } from "@jgengine/core/world/wind";
import type { AmbientFaunaConfig } from "@jgengine/core/ambientFauna/ambientFaunaConfig";

import { editorLayers } from "../editorLayers";
import { SEA_LEVEL } from "../world";

const weather = editorLayers.simulation?.weather?.wind;
const GROW_ABOVE = 2.4;

/**
 * Life the art direction's pass 8 asks for: fish in the shallows, pollen and fireflies and dragonflies over
 * the grass, pteranodons overhead. The groups are `ambient_fauna` zones in editor.scene.json; this table says
 * how each species looks. The catalog has no pteranodon model, so the flyers use its vulture.
 */
export const ambientFauna: AmbientFaunaConfig = {
  species: {
    minnow: {
      model: { url: "/models/quaternius-animated-fish/Fish1.glb", targetHeight: 0.45 },
      sprite: { color: "#bfe9e4", size: 0.07, length: 3 },
    },
    reefFish: {
      model: { url: "/models/quaternius-animated-fish/Fish2.glb", targetHeight: 0.7 },
      sprite: { color: "#f2b24a", size: 0.12, length: 3 },
    },
    pollen: { sprite: { color: "#fff3c4", size: 0.045, glow: true } },
    firefly: { sprite: { color: "#d8f26a", size: 0.07, glow: true } },
    dragonfly: {
      model: { url: "/models/imported/creatures/dragonfly.glb", targetHeight: 0.25 },
      sprite: { color: "#3fb7c9", size: 0.06, length: 4 },
    },
    pteranodon: {
      model: { url: "/models/imported/creatures/vulture.glb", targetHeight: 2.4, material: { color: "#c8b090" } },
      sprite: { color: "#2a2620", size: 0.5, length: 3 },
    },
  },
  surface: SEA_LEVEL,
  plantAt: (_x, _z, ground) => ground > GROW_ABOVE,
  wind: windField({
    direction: weather?.direction ?? [1, 0],
    speed: weather?.speed ?? 3,
    gust: weather?.gust ?? 0,
    ...(weather?.gustFrequency === undefined ? {} : { gustFrequency: weather.gustFrequency }),
    seed: "fernwild",
  }),
};
