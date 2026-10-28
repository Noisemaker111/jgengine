// @skill jgengine-world
/**
 * Rock strata: a stack of planar layers, each with its own erodibility, hillslope diffusivity and the
 * angle it can stand at, tilted by a dip toward a dip direction. Rock moves up with uplift, so the
 * layer under a cell is read at the rock's original elevation: a hard caprock over soft shale rises
 * through the land surface and erosion carves mesas, cuestas and cliffs out of it.
 *
 * @capability landform-evolution grow a heightfield from uplift, river incision, hillslopes, landslides, sediment and rock strata
 */
import { plantCos, plantSin, PLANT_PI } from "../../plants/growth/plantMath";

/** One rock layer. */
export interface RockLayer {
  /** Rock name, e.g. `"sandstone"`; material layers report it per cell. */
  readonly id: string;
  /** Thickness in metres; the last layer extends down forever. */
  readonly thickness: number;
  /** Multiplier on river erodibility K: below 1 resists incision, above 1 yields to it. */
  readonly erodibility: number;
  /** Multiplier on hillslope diffusivity. Default 1. */
  readonly diffusivity?: number;
  /** Steepest angle in degrees the bare rock stands at before it fails. Default 45. */
  readonly criticalAngle?: number;
}

/** A tilted stack of rock layers. */
export interface LandformStrata {
  /** Layers from the top down. */
  readonly layers: readonly RockLayer[];
  /** Rock elevation in metres of the top of the first layer at the grid origin; rock above it is the first layer too. Default 0. */
  readonly top?: number;
  /** Dip in degrees, 0 flat to 90 vertical. Default 0. */
  readonly dip?: number;
  /** Compass direction in degrees the layers dip toward, clockwise from north (row 0). Default 0. */
  readonly dipDirection?: number;
}

/** The default single rock: uniform, standing at 45°. */
export const UNIFORM_ROCK: LandformStrata = { layers: [{ id: "rock", thickness: 1, erodibility: 1 }] };

/** Strata resolved for one grid: per-cell horizontal offsets and the layer bounds. @internal */
export interface ResolvedStrata {
  readonly layers: readonly RockLayer[];
  /** Layer index at a cell for a rock elevation. */
  layerAt(cell: number, rockElevation: number): number;
}

/** Tan of an angle in degrees, the same bits on every engine. @internal */
export function tanDegrees(degrees: number): number {
  const radians = (degrees * PLANT_PI) / 180;
  return plantSin(radians) / plantCos(radians);
}

/** Resolve strata over a grid. @internal */
export function resolveStrata(strata: LandformStrata, cols: number, rows: number, cellSize: number): ResolvedStrata {
  const layers = strata.layers.length > 0 ? strata.layers : UNIFORM_ROCK.layers;
  const top = strata.top ?? 0;
  const dip = ((strata.dip ?? 0) * PLANT_PI) / 180;
  const azimuth = ((strata.dipDirection ?? 0) * PLANT_PI) / 180;
  const cosDip = plantCos(dip);
  const sinDip = plantSin(dip);
  const east = plantSin(azimuth);
  const north = plantCos(azimuth);
  const offset = new Float64Array(cols * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      // Distance along the dip direction; north is toward row 0.
      const along = col * cellSize * east - row * cellSize * north;
      offset[row * cols + col] = along * sinDip;
    }
  }
  const bottoms = new Float64Array(layers.length);
  let depth = 0;
  for (let k = 0; k < layers.length; k += 1) {
    depth += Math.max(0, layers[k]?.thickness ?? 0);
    bottoms[k] = depth;
  }
  const last = layers.length - 1;
  return {
    layers,
    layerAt(cell, rockElevation) {
      // Depth below the top surface, measured across the layers.
      const below = top - (rockElevation * cosDip + (offset[cell] ?? 0));
      for (let k = 0; k < last; k += 1) if (below < (bottoms[k] ?? 0)) return k;
      return last;
    },
  };
}
