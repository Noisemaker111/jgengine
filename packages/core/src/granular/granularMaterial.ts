// @skill jgengine-world
/**
 * What a loose granular material is, for the depth-averaged model in {@link createGranularLayer}: how
 * steep it stands and how it flows, from the friction law of Pouliquen & Forterre (2002), how it packs,
 * and how far a load sinks into it, from the pressure–sinkage law of Bekker (1956) with the soil values
 * Wong (2008) tabulates.
 *
 * @capability granular-flow sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield
 */

/** Bekker pressure–sinkage parameters: p = (k_c / b + k_φ) zⁿ, b the smaller footprint dimension. */
export interface BekkerSoil {
  /** Sinkage exponent n. */
  n: number;
  /** Cohesive modulus k_c, N/m^(n+1). */
  kc: number;
  /** Frictional modulus k_φ, N/m^(n+2). */
  kphi: number;
}

/** A loose granular material. Angles are in degrees. */
export interface GranularMaterial {
  id: string;
  /** Solid grain density, kg/m³. */
  grainDensity: number;
  /** Solid fraction as poured or after flowing. */
  loosePacking: number;
  /** Solid fraction once fully compacted. */
  densePacking: number;
  /** δ₁: a thick layer stops flowing below this slope; the angle of repose of a heap. */
  stopAngle: number;
  /** δ₂: the friction a very thin or very fast layer tends to. */
  flowAngle: number;
  /** δ₃: a thick static layer starts to flow above this slope. */
  startAngle: number;
  /** β of the flow rule Fr = β h / h_stop. */
  beta: number;
  /** Depth scale L of the friction law, m: about 1.3 grain diameters. */
  depthScale: number;
  /** Cohesion of the basal Mohr–Coulomb law, Pa: capillary or clay bonds that let a damp cut stand. */
  cohesion: number;
  /** Pressure–sinkage response to a load, if measured. */
  bekker?: BekkerSoil;
}

/**
 * Glass beads 0.5 mm across on a rough plane, the material Pouliquen & Forterre (2002) fitted their law to.
 * @capability granular-flow sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield
 */
export const GLASS_BEADS: GranularMaterial = { id: "glass-beads", grainDensity: 2500, loosePacking: 0.6, densePacking: 0.64, stopAngle: 21, flowAngle: 30.7, startAngle: 22.2, beta: 0.136, depthScale: 0.65e-3, cohesion: 0 };

/**
 * Dry quartz sand. Repose angle from the poured-cone DEM (`scripts/reference/physics`, mean of three heaps 32.3°); the span to δ₂ and δ₃ and β
 * from the glass-bead fit; packing 0.56 to 0.64 (porosity 0.44 to 0.36); Bekker values for dry sand from Wong (2008).
 * @capability granular-flow sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield
 */
export const DRY_SAND: GranularMaterial = {
  id: "dry-sand",
  grainDensity: 2650,
  loosePacking: 0.56,
  densePacking: 0.64,
  stopAngle: 32.3,
  flowAngle: 42.0,
  startAngle: 33.5,
  beta: 0.136,
  depthScale: 0.65e-3,
  cohesion: 0,
  bekker: { n: 1.1, kc: 990, kphi: 1528430 },
};

/**
 * Sand with about 1% water. Repose angle from the damp poured-cone DEM (3.3° over dry, about half the Nowak et al. 2005 maximum
 * excess); cohesion 0.5 kPa, the tensile strength Rumpf (1958) gives for capillary bridges between 0.5 mm grains, (1 − ε)/ε · 2πRγ/d², which lets a cut stand.
 * @capability granular-flow sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield
 */
export const DAMP_SAND: GranularMaterial = { ...DRY_SAND, id: "damp-sand", loosePacking: 0.5, stopAngle: 35.6, flowAngle: 45.3, startAngle: 36.8, cohesion: 500 };

/**
 * Rounded river gravel, 10–20 mm: repose 38° (Al-Hashemi & Al-Amoudi 2018); depth scale for a 15 mm grain.
 * @capability granular-flow sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield
 */
export const GRAVEL: GranularMaterial = { id: "gravel", grainDensity: 2650, loosePacking: 0.58, densePacking: 0.66, stopAngle: 38, flowAngle: 47.7, startAngle: 39.2, beta: 0.136, depthScale: 0.02, cohesion: 0 };

/**
 * Sandy loam (Michigan), Bekker values and cohesion 1.72 kPa from Wong (2008); stands at its friction angle, 29°.
 * @capability granular-flow sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield
 */
export const SANDY_LOAM: GranularMaterial = {
  id: "sandy-loam",
  grainDensity: 2650,
  loosePacking: 0.5,
  densePacking: 0.6,
  stopAngle: 29,
  flowAngle: 38.7,
  startAngle: 30.2,
  beta: 0.136,
  depthScale: 0.65e-3,
  cohesion: 1720,
  bekker: { n: 0.7, kc: 5270, kphi: 1515040 },
};

function tanDeg(degrees: number): number {
  return Math.tan((degrees * Math.PI) / 180);
}

/**
 * Basal friction μ_stop(h) of a layer `depth` m deep that is just stopping: tan δ₁ + (tan δ₂ − tan δ₁)/(h/L + 1).
 * @capability granular-flow sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield
 */
export function stopFriction(material: GranularMaterial, depth: number): number {
  const t1 = tanDeg(material.stopAngle);
  return t1 + (tanDeg(material.flowAngle) - t1) / (depth / material.depthScale + 1);
}

/**
 * Friction μ_start(h) a static layer `depth` m deep must exceed to start: tan δ₃ + (tan δ₂ − tan δ₁)/(h/L + 1).
 * @capability granular-flow sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield
 */
export function startFriction(material: GranularMaterial, depth: number): number {
  return tanDeg(material.startAngle) + (tanDeg(material.flowAngle) - tanDeg(material.stopAngle)) / (depth / material.depthScale + 1);
}

/**
 * Basal friction of a layer `depth` m deep flowing at Froude number `froude` = u/√(gh), Pouliquen & Forterre (2002):
 * μ_stop(hβ/Fr) above Fr = β and (Fr/β)^γ (μ_stop − μ_start) + μ_start below, γ = 10⁻³. Steady uniform flow then obeys Fr = β h/h_stop(θ).
 * @capability granular-flow sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield
 */
export function flowFriction(material: GranularMaterial, depth: number, froude: number): number {
  if (froude >= material.beta) return stopFriction(material, (depth * material.beta) / froude);
  const stop = stopFriction(material, depth);
  const start = startFriction(material, depth);
  return start + (stop - start) * (froude / material.beta) ** 1e-3;
}

/**
 * Thickness h_stop(θ) a layer leaves behind when it stops on a slope of `angle` degrees: L (tan δ₂ − tan θ)/(tan θ − tan δ₁).
 * Infinite at or below δ₁, 0 at or above δ₂.
 * @capability granular-flow sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield
 */
export function stoppingDepth(material: GranularMaterial, angle: number): number {
  const t = tanDeg(angle);
  const t1 = tanDeg(material.stopAngle);
  const t2 = tanDeg(material.flowAngle);
  if (t <= t1) return Number.POSITIVE_INFINITY;
  if (t >= t2) return 0;
  return (material.depthScale * (t2 - t)) / (t - t1);
}

/**
 * Tallest bank, m, of cohesion `cohesion` Pa and unit weight `unitWeight` N/m³ that stands at slope angle `slope`
 * with friction angle `friction` (both radians): Culmann's planar wedge, H_c = 4c sin β cos φ / (γ (1 − cos(β − φ))).
 * Infinite at or below the friction angle.
 * @capability granular-flow sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield
 */
export function culmannHeight(cohesion: number, unitWeight: number, slope: number, friction: number): number {
  if (slope <= friction) return Number.POSITIVE_INFINITY;
  return (4 * cohesion * Math.sin(slope) * Math.cos(friction)) / (unitWeight * (1 - Math.cos(slope - friction)));
}

/**
 * Bekker sinkage, m, of a flat plate pressing `pressure` Pa on soil, `width` m its smaller dimension: z = (p/(k_c/b + k_φ))^(1/n).
 * @capability granular-flow sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield
 */
export function plateSinkage(soil: BekkerSoil, pressure: number, width: number): number {
  if (pressure <= 0) return 0;
  return (pressure / (soil.kc / width + soil.kphi)) ** (1 / soil.n);
}

/**
 * Pressure, Pa, that sinks a plate `width` m wide to `sinkage` m: the inverse of {@link plateSinkage}.
 * @capability granular-flow sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield
 */
export function plateSinkagePressure(soil: BekkerSoil, sinkage: number, width: number): number {
  if (sinkage <= 0) return 0;
  return (soil.kc / width + soil.kphi) * sinkage ** soil.n;
}

/**
 * Static sinkage, m, of a rigid wheel of `diameter` and `width` m carrying `load` N, Bekker's closed form:
 * z₀ = (3W / ((3 − n)(k_c + b k_φ) √D))^(2/(2n+1)).
 * @capability granular-flow sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield
 */
export function wheelSinkage(soil: BekkerSoil, load: number, width: number, diameter: number): number {
  if (load <= 0) return 0;
  return ((3 * load) / ((3 - soil.n) * (soil.kc + width * soil.kphi) * Math.sqrt(diameter))) ** (2 / (2 * soil.n + 1));
}
