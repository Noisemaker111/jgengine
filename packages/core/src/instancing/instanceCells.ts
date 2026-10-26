/**
 * Spatial cells for instanced draws: bucket placements into a uniform XZ grid so a dense field
 * renders as many small draw units instead of one huge mesh. Each cell carries its own bounds, is
 * frustum-culled on its own, and costs nothing offscreen. Pure and deterministic.
 *
 * @capability instance-cells bucket instanced placements into cullable XZ grid cells
 */

/** One grid cell of placements: one cullable draw unit. */
export interface InstanceCell<T> {
  /** `gx:gz` grid key of the cell. */
  key: string;
  /** Cell minimum XZ corner in world space. */
  min: readonly [number, number];
  /** Cell edge length in meters. */
  size: number;
  items: T[];
}

/** Cell edge used when a caller passes a non-positive or non-finite size. */
export const DEFAULT_INSTANCE_CELL_SIZE = 32;

/**
 * Bucket `items` into `cellSize`-meter XZ cells by the point `at` returns for each. Empty cells are
 * omitted; cells come out row-major by grid coordinate (z rows, then x) and items keep their input
 * order, so the result is deterministic.
 */
export function groupInstancesByCell<T>(
  items: readonly T[],
  cellSize: number,
  at: (item: T) => readonly [number, number],
): InstanceCell<T>[] {
  const size = Number.isFinite(cellSize) && cellSize > 0 ? cellSize : DEFAULT_INSTANCE_CELL_SIZE;
  const cells = new Map<string, InstanceCell<T> & { gx: number; gz: number }>();
  for (const item of items) {
    const [x, z] = at(item);
    const gx = Math.floor(x / size);
    const gz = Math.floor(z / size);
    const key = `${gx}:${gz}`;
    let cell = cells.get(key);
    if (cell === undefined) {
      cell = { key, min: [gx * size, gz * size], size, items: [], gx, gz };
      cells.set(key, cell);
    }
    cell.items.push(item);
  }
  return [...cells.values()]
    .sort((a, b) => a.gz - b.gz || a.gx - b.gx)
    .map(({ key, min, size: edge, items: members }) => ({ key, min, size: edge, items: members }));
}
