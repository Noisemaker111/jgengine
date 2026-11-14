import { windField } from "@jgengine/core/world/wind";
import type { AmbientFaunaConfig } from "@jgengine/core/ambientFauna/ambientFaunaConfig";

import { bodyModel as robotModel } from "../engine-local/creatureBody/bodyPlan";
import { editorLayers } from "../editorLayers";
import { AMBIENT_BODIES } from "./data/robotBodies";
import { SEA_LEVEL } from "../world";

const weather = editorLayers.simulation?.weather?.wind;
const GROW_ABOVE = 2.4;

/**
 * Life the art direction's pass 8 asks for: fish in the shallows, pollen and spark motes over the grass,
 * micro-drones skimming it and Watchwings circling overhead. The groups are `ambient_fauna` zones in
 * editor.scene.json; this table says how each looks. The drones are robot bodies built in code.
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
      model: robotModel(AMBIENT_BODIES.microdrone.plan, AMBIENT_BODIES.microdrone.height),
      sprite: { color: "#3fb7c9", size: 0.06, length: 4 },
    },
    watchwing: {
      model: robotModel(AMBIENT_BODIES.watchwing.plan, AMBIENT_BODIES.watchwing.height),
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
