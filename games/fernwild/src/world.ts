import { environmentContentFromDocument } from "@jgengine/core/editor/environment";
import { surveyFromDocument, surveyTerrain } from "@jgengine/core/terrain/surveyTerrain";
import { environment, ocean, sky, terrain } from "@jgengine/core/world/features";

import { editorLayers } from "./editorLayers";

/** Sea level; the survey's shores ease the land down to the sand just above it. */
export const SEA_LEVEL = 0;
/** The map square: ARK's Island at 3/8 scale (30 m a grid unit) with sea all round. */
const SIZE = 3300;

/**
 * The Island lives in editor.scene.json: shores, summits, mountain chains, rivers, biome outlines,
 * spawn zones and foliage (F2+E). This file only says how the plains roll and how ground, sea and
 * sky are drawn.
 */
const survey = surveyFromDocument(editorLayers);
const authored = environmentContentFromDocument(editorLayers, { minBounds: { w: SIZE, d: SIZE } });
const shaped = surveyTerrain(survey, {
  plains: { height: 7, roll: 5, frequency: 0.0045, seed: "the-island" },
  shore: { falloff: 110, shoreHeight: 0.8, seaFloor: -28, shelf: 140, wobble: 0.35, seed: "the-island" },
});

export const world = environment({
  terrain: terrain({
    bounds: authored.bounds,
    cellSize: 8,
    ...shaped,
    material: "grass",
    colors: { low: "#4f7f35", high: "#7d9a4a" },
    waterLevel: SEA_LEVEL,
    // The sand band rides a little above the sea so beaches read wide; snow is painted by the snow biomes.
    detail: { waterLevel: 2.6, snowHeight: 10_000, sandColor: "#d8c58f" },
  }),
  sky: sky({ preset: "day", timeOfDay: true, ...(authored.sky ?? {}) }),
  water: [ocean({ bounds: { w: SIZE * 1.6, d: SIZE * 1.6 }, level: SEA_LEVEL, color: "#1a9cb8", waveHeight: 0.35, waveScale: 30, waveSpeed: 0.45 })],
  clearings: authored.clearings,
});

/** ARK's default day is about an hour of play; the survivor wakes late morning. */
export const time = { dayLength: 3600, start: (11 / 24) * 3600 };
