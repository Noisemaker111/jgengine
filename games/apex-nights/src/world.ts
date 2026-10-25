import { environmentContentFromDocument } from "@jgengine/core/editor/environment";
import { environment, sky, terrain } from "@jgengine/core/world/features";

import { editorLayers } from "./editorLayers";
import { idea } from "./game/idea";

// The hills, districts, woods and sky live in editor.scene.json, and so does the circuit (a "track"
// path): reshape any of it in the editor (F2+E). The engine draws the track path as the road: its
// meta carries the width, lane paint, sidewalks and the closed loop.
const authored = environmentContentFromDocument(editorLayers, { minBounds: { w: 620, d: 620 }, padding: 60, feather: 6 });

/** Level ground: every `pad` marker flattens a disc (the circuit sits on one), to `meta.level` or the ground's own height. */
const pads = editorLayers.markers
  .filter((marker) => marker.kind === "pad")
  .map((marker) => ({
    center: [marker.position.x, marker.position.z] as const,
    radius: Number(marker.meta?.["radius"] ?? 20),
    ...(marker.meta?.["level"] === undefined ? {} : { height: Number(marker.meta["level"]) }),
    falloff: Number(marker.meta?.["falloff"] ?? 24),
  }));

export const world = environment({
  terrain: terrain({
    bounds: authored.bounds,
    segments: 200,
    seed: idea.id,
    height: idea.world.relief,
    frequency: idea.world.frequency,
    octaves: 4,
    flatten: pads,
    material: idea.ground.material,
    colors: { low: idea.ground.low, high: idea.ground.high },
    waterLevel: idea.world.waterLevel,
    detail: { snowHeight: 400 },
  }),
  sky: sky({ preset: idea.world.sky.preset, timeOfDay: idea.world.sky.cycle, hazeStrength: idea.world.sky.haze, ...(authored.sky ?? {}) }),
  ...(authored.sculpt === undefined ? {} : { sculpt: authored.sculpt }),
  clearings: authored.clearings,
});

/** The in-world clock the sky runs on. */
export const time = {
  dayLength: idea.world.sky.dayLength,
  start: (idea.world.sky.startHour / 24) * idea.world.sky.dayLength,
};
