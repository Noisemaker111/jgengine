import { environmentContentFromDocument } from "@jgengine/core/editor/environment";
import { surveyFromDocument, surveyTerrain } from "@jgengine/core/terrain/surveyTerrain";
import { environment, ocean, sky, terrain } from "@jgengine/core/world/features";

import { editorLayers } from "./editorLayers";
import { BROOD_LAIR } from "./game/data/bosses";

/** Sea level; the survey's shores ease the land down to the sand just above it. */
export const SEA_LEVEL = 0;
/** The map square: ARK's Island at 3/8 scale (30 m a grid unit) with sea all round. */
const SIZE = 3300;

/**
 * The Island lives in editor.scene.json: shores, summits, mountain chains, hills, cliffs, rivers, biome outlines,
 * spawn zones and foliage (F2+E). This file only says how the plains roll and how ground, sea and
 * sky are drawn.
 */
const survey = surveyFromDocument(editorLayers);
const authored = environmentContentFromDocument(editorLayers, { minBounds: { w: SIZE, d: SIZE } });
const shaped = surveyTerrain(survey, {
  plains: { height: 7, roll: 5, frequency: 0.0045, seed: "the-island" },
  shore: { falloff: 70, shoreHeight: 0.8, seaFloor: -28, shelf: 140, wobble: 0.35, seed: "the-island" },
});

export const world = environment({
  terrain: terrain({
    bounds: authored.bounds,
    cellSize: 8,
    ...shaped,
    // The Broodmother's lair: a flat islet out in the far corner's sea, ringed by its wall (game/broodmother.ts).
    flatten: [{ center: BROOD_LAIR.center, radius: BROOD_LAIR.radius + 8, height: BROOD_LAIR.floor, falloff: 30 }],
    material: "grass",
    colors: { low: "#4f7f35", high: "#7d9a4a" },
    waterLevel: SEA_LEVEL,
    // ARK's beaches: a strip of sand about 25 m deep before the ground climbs into the jungle. Snow is painted by the snow biomes.
    detail: {
      waterLevel: 1.6,
      snowHeight: 10_000,
      sandColor: "#d8c58f",
      // Generated PBR ground: pale beach sand with grain and pebbles, soil-and-grass inland, cliff rock on steep slopes.
      surfaces: {
        ground: { preset: "grass", seed: "the-island-ground", tile: 5, tint: 0.9 },
        sand: { preset: "beach-sand", seed: "the-island-beach", tile: 3.5, tint: 0.5 },
        rock: { preset: "cliff", seed: "the-island-cliff", tile: 9 },
      },
    },
  }),
  // ARK keeps a long blue day; dawn and dusk are short. High cumulus drift over it and fill in with the weather.
  sky: sky({
    preset: "day",
    timeOfDay: true,
    dayHold: 0.2,
    cloudiness: 0,
    hazeStrength: 0.25,
    gradientExponent: 0.5,
    volumetricClouds: { height: 420, thickness: 260, scale: 620, coverage: 0.4, density: 1.4, speed: 5, fade: 4200, seed: "the-island" },
    ...(authored.sky ?? {}),
  }),
  // The sea runs to the horizon; the shelf's clear turquoise shallows fall away to deep blue.
  water: [
    ocean({
      bounds: { w: SIZE * 1.6, d: SIZE * 1.6 },
      level: SEA_LEVEL,
      color: "#3fd0c9",
      palette: { deep: "#0b4f78", crest: "#9fe8ef", foam: "#f4fbff", fresnel: 0.8 },
      waveHeight: 0.35,
      waveScale: 30,
      waveSpeed: 0.45,
      horizon: true,
      clarity: 1.6,
      bedResolution: 512,
    }),
  ],
  clearings: authored.clearings,
});

/** ARK's default day is about an hour of play; the survivor wakes late morning. */
export const time = { dayLength: 3600, start: (11 / 24) * 3600 };
