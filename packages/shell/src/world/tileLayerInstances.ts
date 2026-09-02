import type { TilemapWorldConfig } from "@jgengine/core/world/features";

/** One resolved map cell with its world position and atlas UV rectangle. */
export interface TileLayerInstance {
  x: number;
  z: number;
  frame: string;
  uvOffset: readonly [number, number];
  uvScale: readonly [number, number];
}

/** Resolve map glyphs to atlas frames and normalized UV rectangles for deterministic tests and renderers. */
export function resolveTileLayerInstances(config: TilemapWorldConfig): readonly TileLayerInstance[] {
  if (config.tileSet === undefined) return [];
  const { atlas, tiles } = config.tileSet;
  const rows = config.map.replace(/\r\n/g, "\n").split("\n").filter((row) => row.length > 0);
  const width = Math.max(0, ...rows.map((row) => row.length));
  const instances: TileLayerInstance[] = [];
  for (let row = 0; row < rows.length; row += 1) {
    const line = rows[row]!.padEnd(width, " ");
    for (let column = 0; column < width; column += 1) {
      const frame = tiles[line[column]!];
      if (frame === undefined) continue;
      const rect = atlas.frames[frame];
      if (rect === undefined) throw new Error(`tileSet frame "${frame}" is missing from the atlas`);
      instances.push({
        x: column - (width - 1) / 2,
        z: row - (rows.length - 1) / 2,
        frame,
        uvOffset: [rect.x / atlas.size[0], 1 - (rect.y + rect.h) / atlas.size[1]],
        uvScale: [rect.w / atlas.size[0], rect.h / atlas.size[1]],
      });
    }
  }
  return instances;
}
