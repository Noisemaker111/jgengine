import type { Vec2 } from "../world/geometry";
import {
  bakeMinimapImage,
  minimapBakeToPngDataUri,
  type MinimapBakeBounds,
  type MinimapBakeOptions,
  type MinimapBakeZone,
} from "../world/minimapBake";
import { editorDocumentBounds } from "./document";
import type { EditorDocument, EditorVolume } from "./types";

/**
 * The editor-side minimap bake (#1036): bake a top-down terrain image straight from the authored
 * scene document. The document owns the zones (biome-tinted volumes) and the footprint; the caller
 * supplies the composed `sampleHeight` (base terrain + the document's sculpt), since the sculpt on
 * the document is a delta over the game's base terrain. Returns the `{ background, mapBounds }` the
 * `Minimap`/`WorldMap` props take, so the editor stores that on the document and runtime consumes it
 * with no new render path. Deterministic for a fixed scene — safe for verify/CI.
 */

/** A volume that carries a `color` tints the bake over its XZ footprint. */
function volumeFootprint(volume: EditorVolume): readonly Vec2[] | null {
  const half =
    volume.halfExtents !== undefined
      ? { x: volume.halfExtents.x, z: volume.halfExtents.z }
      : volume.radius !== undefined
        ? { x: volume.radius, z: volume.radius }
        : null;
  if (half === null) return null;
  const { x, z } = volume.center;
  return [
    [x - half.x, z - half.z],
    [x + half.x, z - half.z],
    [x + half.x, z + half.z],
    [x - half.x, z + half.z],
  ];
}

/**
 * The biome-tint zones a document contributes to a bake: every volume carrying a `color` becomes a
 * polygon tint over its footprint. (The optional stretch from #1036 — a bare bake still reads as
 * terrain without any.)
 * @capability minimap-bake derive biome-tint zones for a bake from the scene document
 */
export function documentBakeZones(doc: EditorDocument): MinimapBakeZone[] {
  const zones: MinimapBakeZone[] = [];
  for (const volume of doc.volumes) {
    if (volume.color === undefined) continue;
    const polygon = volumeFootprint(volume);
    if (polygon === null) continue;
    zones.push({ polygon, color: volume.color, alpha: 0.4 });
  }
  return zones;
}

/** Options for {@link bakeMinimapFromDocument}. */
export interface DocumentBakeOptions extends MinimapBakeOptions {
  /** Explicit bounds; default = the document's object bounds padded by `padding`. */
  bounds?: MinimapBakeBounds;
  /** Padding (m) around the derived bounds when `bounds` is omitted. Default 16. */
  padding?: number;
  /** Ground normal sampler for slope shading (optional). */
  sampleNormal?: (x: number, z: number) => readonly [number, number, number];
  /** Water level — ground at or below renders as water. */
  waterLevel?: number;
}

/** Falls back to a small square when the document has no spatial objects. */
function boundsFromDocument(doc: EditorDocument, padding: number): MinimapBakeBounds {
  const b = editorDocumentBounds(doc);
  if (b === null) return { minX: -32, minZ: -32, maxX: 32, maxZ: 32 };
  return { minX: b.min.x - padding, minZ: b.min.z - padding, maxX: b.max.x + padding, maxZ: b.max.z + padding };
}

/**
 * Bakes a minimap image from a scene document plus a terrain height sampler: sizes the footprint to
 * the authored objects (or an explicit `bounds`), tints biome-colored volumes, and rasterizes the
 * terrain top-down. Returns `{ background, mapBounds }` for the `Minimap` props. The editor runs this
 * as its bake action and stores the result on the document.
 * @capability minimap-bake bake a minimap PNG + bounds from the authored scene document
 */
export function bakeMinimapFromDocument(
  doc: EditorDocument,
  sampleHeight: (x: number, z: number) => number,
  options: DocumentBakeOptions = {},
): { background: string; mapBounds: MinimapBakeBounds } {
  const bounds = options.bounds ?? boundsFromDocument(doc, options.padding ?? 16);
  const bake = bakeMinimapImage(
    {
      bounds,
      sampleHeight,
      ...(options.sampleNormal === undefined ? {} : { sampleNormal: options.sampleNormal }),
      ...(options.waterLevel === undefined ? {} : { waterLevel: options.waterLevel }),
      zones: documentBakeZones(doc),
    },
    {
      ...(options.resolution === undefined ? {} : { resolution: options.resolution }),
      ...(options.palette === undefined ? {} : { palette: options.palette }),
    },
  );
  return { background: minimapBakeToPngDataUri(bake), mapBounds: bake.bounds };
}
