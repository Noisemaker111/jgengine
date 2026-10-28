// @skill jgengine-world
import { M_PER_FT } from "./fuelModels";

/** The forest canopy over a surface fuel bed, if any. */
export interface CanopyShelter {
  /** Canopy cover, fraction of ground under crowns. */
  cover: number;
  /** Canopy (stand) height, m. */
  heightM: number;
  /** Crown ratio, fraction of tree height carrying live crown. */
  crownRatio: number;
}

/**
 * Wind adjustment factor from the 20-ft (6.1 m) open wind to midflame wind (Albini & Baughman 1979;
 * Baughman & Albini 1980; Andrews 2012). Unsheltered fuel uses the fuel bed depth; fuel under a
 * canopy that fills at least 5 % of the crown space and stands 6 ft or taller is sheltered.
 *
 * @capability fire-wind-adjustment convert 20-ft or 10-m open wind to midflame wind over open or sheltered fuel
 */
export function windAdjustmentFactor(fuelbedDepthM: number, canopy?: CanopyShelter): number {
  if (canopy !== undefined) {
    const fill = (canopy.crownRatio * canopy.cover) / 3;
    const h = canopy.heightM / M_PER_FT;
    if (canopy.cover > 1e-7 && fill >= 0.05 && h >= 6) {
      return 0.555 / (Math.sqrt(fill * h) * Math.log((20 + 0.36 * h) / (0.13 * h)));
    }
  }
  const depth = fuelbedDepthM / M_PER_FT;
  if (depth <= 1e-7) return 0;
  return 1.83 / Math.log((20 + 0.36 * depth) / (0.13 * depth));
}

/**
 * 20-ft wind from a 10-m wind: divide by 1.15 (Turner & Lawson 1978, as in BehavePlus).
 *
 * @capability fire-twenty-foot-wind 20-ft open wind from a 10-m wind
 */
export function twentyFootWind(tenMetreWind: number): number {
  return tenMetreWind / 1.15;
}
