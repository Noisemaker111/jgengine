/** Ambient life for Row Six: smoke columns over the dumps, sparks and heat off the compactor, gulls circling the heaps.
 * Authored through the editor's simulation inputs; runtime reads only the document.
 * Run from drift-foundry with `bun scripts/author-ambience.ts`.
 */
import { createEditorHost } from "@jgengine/editor/session";
import { readFileSync, writeFileSync } from "node:fs";

import { COMPACTOR_ENTITY } from "../src/game/entities/catalog";

const path = new URL("../src/editor.scene.json", import.meta.url);
const { session, api, dispose } = createEditorHost({ gameId: "drift-foundry", layers: JSON.parse(readFileSync(path, "utf8")) });

/** Smoke columns rise from burning dumps either side of the yard, one per stretch, so a column is always ahead. */
const SMOKE = [
  [-36, 70], [37, 120], [-38, 200], [36, 260], [-37, 340], [38, 400], [-36, 450],
] as const;
const smoke = SMOKE.map(([x, z], index) => ({
  id: `dump-smoke-${index + 1}`,
  position: { x, y: 0.5, z },
  effect: "smoke/plume",
}));

/** The compactor drags steel across the ground: sparks off its teeth and a warm shimmer above its cap. */
const compactor = [
  {
    id: "compactor-sparks",
    position: { x: 0, y: 0.6, z: 0 },
    config: {
      rate: 70,
      max: 160,
      direction: [0, 0.6, 1],
      spread: 0.9,
      spawnJitter: [18, 0.3, 0.5],
      speed: { min: 4, max: 9 },
      gravity: [0, -14, 0],
      lifetime: { min: 0.4, max: 0.9 },
      size: { start: 0.3, end: 0.05 },
      colorStart: 0xfff2b0,
      colorEnd: 0xff6a1a,
      alpha: { start: 1, end: 0 },
    },
    options: { follow: COMPACTOR_ENTITY, offset: [0, 0.6, 2.4], blending: "additive", space: "world" },
  },
  {
    id: "compactor-heat",
    position: { x: 0, y: 24, z: 0 },
    config: {
      rate: 18,
      max: 80,
      direction: [0, 1, 0],
      spread: 0.25,
      spawnJitter: [24, 0.5, 2],
      speed: { min: 1.2, max: 2.4 },
      gravity: [0, 0.8, 0],
      drag: 0.4,
      lifetime: { min: 2, max: 3.2 },
      size: { start: 3, end: 7 },
      colorStart: 0xff8a3a,
      colorEnd: 0xffb066,
      alpha: { start: 0.07, end: 0 },
    },
    options: { follow: COMPACTOR_ENTITY, offset: [0, 24, 0], blending: "additive", space: "world" },
  },
];

const GULL = { maxSpeed: 7, separationRadius: 3, neighborRadius: 14, cohesionWeight: 0.8, alignmentWeight: 1, stragglerRadius: 36 };
const habitats = [
  [-30, 90], [31, 230], [-30, 390],
].map(([x, z], index) => ({
  id: `gulls-${index + 1}`,
  species: "gull",
  position: { x, y: 26, z },
  radius: 26,
  count: 6,
  seed: `gulls-${index + 1}`,
  role: "cosmetic" as const,
  steering: GULL,
}));

const result = api.handle({ method: "set_simulation", simulation: { emitters: [...smoke, ...compactor], habitats } });
if (!result.ok) throw new Error(JSON.stringify(result));
writeFileSync(path, session.exportJson(true) + "\n");
console.log(JSON.stringify(api.handle({ method: "scene_summary" })).slice(0, 200));
dispose();
