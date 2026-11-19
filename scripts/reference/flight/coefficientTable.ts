// @skill jgengine-world

export interface CoefficientTableAxis {
  breakpoints: readonly number[];
  extrapolate?: "linear" | "clamp";
}

export interface CoefficientTable {
  readonly axes: readonly CoefficientTableAxis[];
  sample(point: readonly number[]): number;
}

/** @capability coefficient-table N-dimensional gridded data table with multilinear interpolation and per-axis extrapolation */
// stateless: strides and breakpoints are built once from the axes and never written after the factory returns
export function createCoefficientTable(axes: readonly CoefficientTableAxis[], values: readonly number[]): CoefficientTable {
  if (axes.length === 0) throw new Error("createCoefficientTable: at least one axis");
  let size = 1;
  const strides: number[] = [];
  for (let i = axes.length - 1; i >= 0; i -= 1) {
    strides[i] = size;
    const axis = axes[i];
    const count = axis?.breakpoints.length ?? 0;
    if (count < 2) throw new Error(`createCoefficientTable: axis ${i} needs two breakpoints`);
    const points = axis?.breakpoints ?? [];
    for (let j = 1; j < count; j += 1) {
      if ((points[j] ?? 0) <= (points[j - 1] ?? 0)) throw new Error(`createCoefficientTable: axis ${i} breakpoints must increase`);
    }
    size *= count;
  }
  if (values.length !== size) throw new Error(`createCoefficientTable: expected ${size} values, got ${values.length}`);
  const dims = axes.length;
  const cell: number[] = new Array<number>(dims).fill(0);
  const frac: number[] = new Array<number>(dims).fill(0);
  const corners = 1 << dims;

  return {
    axes,
    sample(point) {
      for (let d = 0; d < dims; d += 1) {
        const axis = axes[d];
        const points = axis?.breakpoints ?? [];
        const x = point[d] ?? 0;
        const last = points.length - 2;
        let i = 0;
        while (i < last && x >= (points[i + 1] ?? 0)) i += 1;
        const x0 = points[i] ?? 0;
        const x1 = points[i + 1] ?? x0;
        let t = (x - x0) / (x1 - x0);
        if (axis?.extrapolate !== "linear") t = Math.max(0, Math.min(1, t));
        cell[d] = i;
        frac[d] = t;
      }
      let total = 0;
      for (let corner = 0; corner < corners; corner += 1) {
        let weight = 1;
        let index = 0;
        for (let d = 0; d < dims; d += 1) {
          const upper = (corner >> (dims - 1 - d)) & 1;
          const t = frac[d] ?? 0;
          weight *= upper === 1 ? t : 1 - t;
          index += ((cell[d] ?? 0) + upper) * (strides[d] ?? 0);
        }
        if (weight !== 0) total += weight * (values[index] ?? 0);
      }
      return total;
    },
  };
}

/** @capability coefficient-table evenly spaced table breakpoints */
export function evenBreakpoints(start: number, end: number, count: number): number[] {
  const points: number[] = [];
  for (let i = 0; i < count; i += 1) points.push(start + ((end - start) * i) / (count - 1));
  return points;
}
