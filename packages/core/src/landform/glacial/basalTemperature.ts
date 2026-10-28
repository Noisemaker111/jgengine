// @skill jgengine-world
/**
 * Where a glacier's bed is at the pressure-melting point. Only a temperate bed slides, so only a
 * temperate bed erodes; thin ice high above the snowline stays frozen to its rock and keeps it,
 * as cold-based ice keeps summits and plateaus (Kleman & Hättestrand 1999). The bed temperature is
 * steady conduction through the column, T_b = T_s + G·H/k, under a surface at the air temperature,
 * T_s = T_ELA − Γ(s − ELA), no warmer than 0 °C. The bed is temperate once T_b reaches the melting
 * point, which pressure lowers by 8.7·10⁻⁴ K per metre of ice (Cuffey & Paterson 2010); the share
 * ramps over the last kelvin below it. Strain heating and heat carried by the ice are left out, so
 * fast ice is a little colder here than it would be.
 *
 * @capability landform-glacial glaciers that flow, slide, carve their valleys wider and deeper and lay moraines
 */

/** Melting point lowering in K per metre of ice (air-saturated ice, Cuffey & Paterson 2010). */
const MELTING_SLOPE = 8.7e-4;

/** Thermal conductivity of ice in W m⁻¹ K⁻¹. */
const ICE_CONDUCTIVITY = 2.1;

/** The climate a glacier's bed temperature follows. @internal */
export interface BasalClimate {
  /** Snowline altitude in metres. */
  ela: number;
  /** Mean annual air temperature at the snowline in °C. */
  snowlineTemperature: number;
  /** Fall of air temperature with altitude in K/m. */
  lapseRate: number;
  /** Geothermal heat flux in W/m². */
  geothermalFlux: number;
}

/**
 * Share of each cell's bed at the pressure-melting point, 0 frozen to 1 temperate, into `out`.
 * Bare cells read 0.
 * @internal
 */
export function temperateBed(out: Float64Array, bed: ArrayLike<number>, ice: ArrayLike<number>, climate: BasalClimate): Float64Array {
  const warming = climate.geothermalFlux / ICE_CONDUCTIVITY;
  for (let i = 0; i < out.length; i += 1) {
    const h = ice[i] ?? 0;
    if (h <= 0) {
      out[i] = 0;
      continue;
    }
    const air = climate.snowlineTemperature - climate.lapseRate * ((bed[i] ?? 0) + h - climate.ela);
    const surface = air < 0 ? air : 0;
    const belowMelting = -MELTING_SLOPE * h - (surface + warming * h);
    out[i] = belowMelting <= 0 ? 1 : belowMelting >= 1 ? 0 : 1 - belowMelting;
  }
  return out;
}
