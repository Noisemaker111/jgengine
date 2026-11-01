/** Ambient life for the habitat: mint and pink spores drifting over the flora clusters, and slow
 * butter glows pulsing at the shell's corners. Authored through the editor's simulation inputs;
 * runtime reads only the document. Run from odd-orbit with `bun scripts/author-ambience.ts`.
 */
import { createEditorHost } from "@jgengine/editor/session";
import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../src/editor.scene.json", import.meta.url);
const { session, api, dispose } = createEditorHost({ gameId: "odd-orbit", layers: JSON.parse(readFileSync(path, "utf8")) });

const SPORE_FIELDS = [
  [-26, -20], [24, -24], [30, 12], [-28, 18], [4, 30], [-6, -32],
] as const;
const spores = SPORE_FIELDS.map(([x, z], index) => ({
  id: `spores-${index + 1}`,
  position: { x, y: 0.6, z },
  config: {
    rate: 6,
    max: 60,
    direction: [0, 1, 0],
    spread: 0.5,
    spawnJitter: [7, 0.4, 7],
    speed: { min: 0.15, max: 0.45 },
    gravity: [0.04, 0.05, 0.02],
    drag: 0.3,
    lifetime: { min: 6, max: 10 },
    size: { start: 0.18, end: 0.04 },
    colorStart: index % 2 === 0 ? 0x9fe0c4 : 0xf6a6cf,
    colorEnd: 0xfff0d6,
    alpha: { start: 0.9, end: 0 },
  },
  options: { blending: "additive", space: "world" },
}));

const BLINKS = [[-12, -9], [12, -9], [-12, 9], [12, 9], [0, -9]] as const;
const blinks = BLINKS.map(([x, z], index) => ({
  id: `shell-light-${index + 1}`,
  position: { x, y: 2.2, z },
  config: {
    rate: 0.4,
    max: 3,
    direction: [0, 0, 0],
    spread: 0,
    speed: { min: 0, max: 0 },
    lifetime: { min: 2.4, max: 2.4 },
    size: { start: 0.2, end: 0.9 },
    colorStart: 0xffd98a,
    colorEnd: 0xf6a6cf,
    alpha: { start: 0.9, end: 0 },
  },
  options: { blending: "additive", space: "world" },
}));

const result = api.handle({ method: "set_simulation", simulation: { emitters: [...spores, ...blinks] } });
if (!result.ok) throw new Error(JSON.stringify(result));
writeFileSync(path, session.exportJson(true) + "\n");
dispose();
