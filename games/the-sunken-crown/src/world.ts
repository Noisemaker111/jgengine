import { environmentContentFromDocument } from "@jgengine/core/editor/environment";
import { environment, sky, terrain } from "@jgengine/core/world/features";

import { editorLayers } from "./editorLayers";
import { idea } from "./game/idea";

// Places - towns, forests, lakes, paths, clearings and the sky's mood - live in editor.scene.json;
// reshape them in the editor (F2+E). This file only picks how the ground and sky are drawn, from idea.ts.
const authored = environmentContentFromDocument(editorLayers, { minBounds: { w: 520, d: 520 }, padding: 60, feather: 6 });

/** Level ground under towns, camps and lake shores: every `pad` marker flattens a disc, to `meta.level` or the ground's own height there. */
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
    // Snow only on a snowy idea; elsewhere the detail shader reads grass and dirt into rock.
    detail: idea.ground.material === "snow" ? {} : { snowHeight: 400 },
  }),
  sky: sky({
    preset: idea.world.sky.preset,
    timeOfDay: idea.world.sky.cycle,
    hazeStrength: idea.world.sky.haze,
    ...(authored.sky ?? {}),
  }),
  ...(authored.sculpt === undefined ? {} : { sculpt: authored.sculpt }),
  clearings: authored.clearings,
});

/** The in-world clock the sky runs on: one day lasts `dayLength` seconds of play, starting at `startHour`. */
export const time = {
  dayLength: idea.world.sky.dayLength,
  start: (idea.world.sky.startHour / 24) * idea.world.sky.dayLength,
};
