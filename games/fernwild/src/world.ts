import { environmentContentFromDocument } from "@jgengine/core/editor/environment";
import { environment, ocean, sky, terrain } from "@jgengine/core/world/features";

import { editorLayers } from "./editorLayers";

/** The island: wider east-west than north-south like ARK's, beaches all round, hills inland. */
export const ISLAND = { radius: 900, stretch: [1.15, 0.9] as const, seaLevel: 0 };
const SIZE = 2600;

// Spawn markers, foliage regions and sculpt live in editor.scene.json (F2+E); this file shapes the
// landmass and picks how ground, sea and sky are drawn.
const authored = environmentContentFromDocument(editorLayers, { minBounds: { w: SIZE, d: SIZE } });

export const world = environment({
  terrain: terrain({
    bounds: authored.bounds,
    segments: 320,
    seed: "fernwild",
    height: 70,
    frequency: 0.0016,
    octaves: 5,
    baseHeight: 18,
    coast: { radius: ISLAND.radius, stretch: ISLAND.stretch, falloff: 260, shoreHeight: 0.8, seaFloor: -28, shelf: 160, wobble: 0.22, seed: "fernwild" },
    material: "grass",
    colors: { low: "#4f7f35", high: "#7d9a4a" },
    waterLevel: ISLAND.seaLevel,
    // The sand band rides a little above the sea so the beach reads as ARK's wide south shore; snow waits for the snow biome.
    detail: { waterLevel: 2.6, snowHeight: 400, sandColor: "#d8c58f" },
  }),
  sky: sky({ preset: "day", timeOfDay: true, ...(authored.sky ?? {}) }),
  water: [ocean({ bounds: { w: SIZE * 1.6, d: SIZE * 1.6 }, level: ISLAND.seaLevel, color: "#1a9cb8", waveHeight: 0.35, waveScale: 30, waveSpeed: 0.45 })],
  ...(authored.sculpt === undefined ? {} : { sculpt: authored.sculpt }),
  clearings: authored.clearings,
});

/** ARK's default day is about an hour of play; the survivor wakes late morning. */
export const time = { dayLength: 3600, start: (11 / 24) * 3600 };
