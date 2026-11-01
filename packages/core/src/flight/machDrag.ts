// @skill jgengine-world

/**
 * The Mach drag effect: a body's drag coefficient by Mach number, so drag rises through the transonic hump the way a
 * rocket's axial-force coefficient or an airliner's drag-divergence curve does. It replaces the tuning's constant
 * `dragArea`.
 */
export interface AircraftMachDrag {
  /**
   * Multiplier on the effect: `0` off (`dragArea` alone, the simple model), `1` as tabled (default), past `1` the
   * drag scales with the strength; sane over `0..4`.
   */
  strength?: number;
  /** Reference area, m². */
  area: number;
  /** `[Mach, drag coefficient]` points, linear between, held flat past the ends. */
  coefficient: readonly (readonly [number, number])[];
}

/**
 * Drag area, m², at a Mach number before the strength: the tabled coefficient times the reference area.
 * @capability aircraft-mach-drag body drag coefficient by Mach number
 */
export function machDragArea(effect: AircraftMachDrag, mach: number): number {
  const points = effect.coefficient;
  const first = points[0];
  if (first === undefined) return 0;
  if (mach <= first[0]) return first[1] * effect.area;
  for (let i = 1; i < points.length; i += 1) {
    const point = points[i];
    const previous = points[i - 1];
    if (point === undefined || previous === undefined) continue;
    if (mach <= point[0]) return (previous[1] + ((point[1] - previous[1]) * (mach - previous[0])) / Math.max(1e-9, point[0] - previous[0])) * effect.area;
  }
  return (points[points.length - 1]?.[1] ?? 0) * effect.area;
}
