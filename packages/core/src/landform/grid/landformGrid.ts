// @skill jgengine-world
/**
 * The square-cell grid every landform process runs on: row-major cells, the eight D8 neighbours with
 * their distances, and which cells are base level (outlets held at a fixed height, where water and
 * sediment leave the map).
 *
 * @capability landform-evolution grow a heightfield from uplift, river incision, hillslopes, landslides, sediment and rock strata
 */

/** Map edges that can be base level. */
export type LandformEdge = "north" | "south" | "east" | "west";

/** A landform grid: `cols` × `rows` square cells, `cellSize` metres a side, row 0 at the north edge. */
export interface LandformGrid {
  readonly cols: number;
  readonly rows: number;
  /** Cell side in metres. */
  readonly cellSize: number;
  /**
   * Edges whose cells are base level: open outlets held at their height. Default every edge. Closed
   * edges pass no water, so rivers must leave through an open one.
   */
  readonly outlets?: readonly LandformEdge[];
}

/** Largest grid side the model accepts, so one step's work stays bounded. */
export const LANDFORM_MAX_SIDE = 2048;

/** Column offsets of the D8 neighbours: east, south-east, south, south-west, west, north-west, north, north-east. */
export const D8_DCOL: readonly number[] = [1, 1, 0, -1, -1, -1, 0, 1];
/** Row offsets of the D8 neighbours, in {@link D8_DCOL} order. */
export const D8_DROW: readonly number[] = [0, 1, 1, 1, 0, -1, -1, -1];

/** A grid's cell count after validating its size. @internal */
export function landformCellCount(grid: LandformGrid): number {
  const { cols, rows, cellSize } = grid;
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 3 || rows < 3) throw new Error(`landform grid must be at least 3×3 whole cells, got ${cols}×${rows}`);
  if (cols > LANDFORM_MAX_SIDE || rows > LANDFORM_MAX_SIDE) throw new Error(`landform grid side is at most ${LANDFORM_MAX_SIDE}, got ${cols}×${rows}`);
  if (!(cellSize > 0)) throw new Error(`landform cellSize must be positive, got ${cellSize}`);
  return cols * rows;
}

/**
 * Neighbour tables for a grid: for cell `i` and direction `k` (0..7), `neighbour[i*8+k]` is the
 * neighbour's index or -1 past the edge, and `distance[k]` the centre-to-centre distance.
 * @internal
 */
export interface LandformTopology {
  readonly cols: number;
  readonly rows: number;
  readonly cells: number;
  readonly cellSize: number;
  readonly cellArea: number;
  readonly neighbour: Int32Array;
  readonly distance: Float64Array;
  /** 1 where a cell is base level. */
  readonly base: Uint8Array;
}

/** Build the neighbour tables and base-level mask of a grid. @internal */
export function landformTopology(grid: LandformGrid): LandformTopology {
  const cells = landformCellCount(grid);
  const { cols, rows, cellSize } = grid;
  const neighbour = new Int32Array(cells * 8);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const i = row * cols + col;
      for (let k = 0; k < 8; k += 1) {
        const c = col + (D8_DCOL[k] ?? 0);
        const r = row + (D8_DROW[k] ?? 0);
        neighbour[i * 8 + k] = c < 0 || r < 0 || c >= cols || r >= rows ? -1 : r * cols + c;
      }
    }
  }
  const diagonal = cellSize * Math.SQRT2;
  const distance = new Float64Array(8);
  for (let k = 0; k < 8; k += 1) distance[k] = k % 2 === 0 ? cellSize : diagonal;
  const outlets = grid.outlets ?? ["north", "south", "east", "west"];
  const base = new Uint8Array(cells);
  for (let col = 0; col < cols; col += 1) {
    if (outlets.includes("north")) base[col] = 1;
    if (outlets.includes("south")) base[(rows - 1) * cols + col] = 1;
  }
  for (let row = 0; row < rows; row += 1) {
    if (outlets.includes("west")) base[row * cols] = 1;
    if (outlets.includes("east")) base[row * cols + cols - 1] = 1;
  }
  if (!base.includes(1)) throw new Error("landform grid needs at least one outlet edge");
  return { cols, rows, cells, cellSize, cellArea: cellSize * cellSize, neighbour, distance, base };
}
