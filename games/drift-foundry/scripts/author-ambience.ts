/** Ambient life for Aisle 9: freezer fog rolling off the frozen cases, suds and spray off the floor scrubber, pigeons under the roof.
 * Authored through the editor's simulation inputs; runtime reads only the document.
 * Run from drift-foundry with `bun scripts/author-ambience.ts`.
 */
import { createEditorHost } from "@jgengine/editor/session";
import { readFileSync, writeFileSync } from "node:fs";

import { COMPACTOR_ENTITY } from "../src/game/entities/catalog";

const path = new URL("../src/editor.scene.json", import.meta.url);
const { session, api, dispose } = createEditorHost({ gameId: "drift-foundry", layers: JSON.parse(readFileSync(path, "utf8")) });

/** Cold fog spills off the open freezer cases in the frozen section, low and white, either side of the aisle. */
const FOG = [
  [-24, 165], [24, 190], [-24, 215], [24, 240], [-24, 265], [24, 290],
] as const;
const fog = FOG.map(([x, z], index) => ({
  id: `freezer-fog-${index + 1}`,
  position: { x, y: 0.4, z },
  config: {
    rate: 10,
    max: 50,
    direction: [Math.sign(-x), 0.05, 0] as [number, number, number],
    spread: 0.5,
    spawnJitter: [0.6, 0.3, 2] as [number, number, number],
    speed: { min: 0.4, max: 1.1 },
    gravity: [0, -0.05, 0] as [number, number, number],
    drag: 0.6,
    lifetime: { min: 2.5, max: 4 },
    size: { start: 1.2, end: 3.2 },
    colorStart: 0xeaf7ff,
    colorEnd: 0xffffff,
    alpha: { start: 0.18, end: 0 },
  },
  options: { blending: "normal" as const, space: "world" as const },
}));

/** The floor scrubber's brush bar throws soap suds forward and a fine spray above the shutter line. */
const scrubber = [
  {
    id: "scrubber-suds",
    position: { x: 0, y: 0.6, z: 0 },
    config: {
      rate: 60,
      max: 160,
      direction: [0, 0.5, 1],
      spread: 0.9,
      spawnJitter: [20, 0.3, 0.5],
      speed: { min: 1.5, max: 4 },
      gravity: [0, -3, 0],
      drag: 0.3,
      lifetime: { min: 0.6, max: 1.4 },
      size: { start: 0.35, end: 0.6 },
      colorStart: 0xffffff,
      colorEnd: 0xbfe8ff,
      alpha: { start: 0.9, end: 0 },
    },
    options: { follow: COMPACTOR_ENTITY, offset: [0, 0.6, 3.4], blending: "normal", space: "world" },
  },
  {
    id: "scrubber-spray",
    position: { x: 0, y: 2, z: 0 },
    config: {
      rate: 16,
      max: 70,
      direction: [0, 1, 0.4],
      spread: 0.35,
      spawnJitter: [22, 0.4, 1],
      speed: { min: 1, max: 2.2 },
      gravity: [0, 0.3, 0],
      drag: 0.4,
      lifetime: { min: 1.6, max: 2.6 },
      size: { start: 1.5, end: 4 },
      colorStart: 0xdff4ff,
      colorEnd: 0xffffff,
      alpha: { start: 0.08, end: 0 },
    },
    options: { follow: COMPACTOR_ENTITY, offset: [0, 2, 2.8], blending: "normal", space: "world" },
  },
];

/** Pigeons that came in through the loading dock, circling under the roof over each section. */
const PIGEON = { maxSpeed: 6, separationRadius: 2.5, neighborRadius: 12, cohesionWeight: 0.8, alignmentWeight: 1, stragglerRadius: 30 };
const habitats = [
  [-26, 90], [27, 230], [-26, 390],
].map(([x, z], index) => ({
  id: `gulls-${index + 1}`,
  species: "gull",
  position: { x, y: 13, z },
  radius: 20,
  count: 5,
  seed: `pigeons-${index + 1}`,
  role: "cosmetic" as const,
  steering: PIGEON,
}));

const result = api.handle({ method: "set_simulation", simulation: { emitters: [...fog, ...scrubber], habitats } });
if (!result.ok) throw new Error(JSON.stringify(result));
writeFileSync(path, session.exportJson(true) + "\n");
console.log(JSON.stringify(api.handle({ method: "scene_summary" })).slice(0, 200));
dispose();
