import { bakeMinimapFromDocument } from "@jgengine/core/editor/index";
import type { MarkerKindStyle, MarkerView } from "@jgengine/core/map/markers";
import { DEFAULT_MARKER_KINDS } from "@jgengine/core/map/markers";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { markersOfKind } from "@jgengine/core/world/authoredSpawn";

import { editorLayers } from "../editorLayers";
import { SEA_LEVEL } from "../world";
import { tames } from "./creatures";
import { noteMarks } from "./dossier";
import { NOTES } from "./data/notes";

/** Half the map square the bake spans, sea included (world.ts's SIZE / 2). */
const HALF = 1650;
/** Pixels along the bake's side: about 13 m a pixel, enough to read shores, rivers and peaks. */
const RESOLUTION = 256;

/** The island seen from above, baked once from the same ground the survivor walks on. */
export const islandBake = perContext((ctx: GameContext) =>
  bakeMinimapFromDocument(editorLayers, (x, z) => ctx.world.groundHeightAt(x, z), {
    bounds: { minX: -HALF, minZ: -HALF, maxX: HALF, maxZ: HALF },
    resolution: RESOLUTION,
    waterLevel: SEA_LEVEL,
  }),
);

/** What the map marks beyond the first-day goal: notes not yet read, obelisks, cave mouths and your tames. */
export const ISLAND_MARKS: Record<string, MarkerKindStyle> = {
  ...DEFAULT_MARKER_KINDS,
  note: { id: "note", color: "#f4e3a1", glyph: "✎", priority: 75 },
  obelisk: { id: "obelisk", color: "#c58bff", glyph: "▲", priority: 60 },
  cave: { id: "cave", color: "#fb923c", glyph: "◉", priority: 55 },
  tame: { id: "tame", color: "#38bdf8", glyph: "●", priority: 65 },
};

const fixed = perContext((_ctx: GameContext): MarkerView[] => [
  ...markersOfKind(editorLayers, "obelisk").map((marker) => ({ id: `obelisk:${marker.id}`, kind: "obelisk", label: `${String(marker.meta?.["color"] ?? "")} obelisk`.trim(), position: [marker.position.x, 0, marker.position.z] as const })),
  ...editorLayers.paths
    .filter((path) => path.kind === "cave" && path.points[0] !== undefined)
    .map((path) => ({ id: `cave:${path.id}`, kind: "cave", label: path.label ?? path.id, position: [path.points[0]!.x, 0, path.points[0]!.z] as const })),
]);

export function islandMarks(ctx: GameContext): MarkerView[] {
  return [
    ...fixed(ctx),
    ...noteMarks(ctx)
      .filter((mark) => !mark.read)
      .map((mark) => ({ id: `note:${mark.id}`, kind: "note", label: NOTES.find((note) => note.at === mark.id)?.title ?? "Note", position: [Math.round(mark.at[0]), 0, Math.round(mark.at[1])] as const })),
    ...tames(ctx).map((tame) => ({ id: `tame:${tame.id}`, kind: "tame", label: tame.species, position: [Math.round(tame.at[0]), 0, Math.round(tame.at[2])] as const })),
  ];
}
