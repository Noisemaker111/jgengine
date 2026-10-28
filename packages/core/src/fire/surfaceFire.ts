// @skill jgengine-world
import { KG_M2_PER_LB_FT2, KJ_KG_PER_BTU_LB, M_PER_FT, type FuelModel, type FuelMoisture } from "./fuelModels";

/** kW/m² per Btu/ft²/min. */
const KW_M2_PER_BTU_FT2_MIN = (1055.05585262 / (M_PER_FT * M_PER_FT)) / 60 / 1000;
/** kW/m per Btu/ft/s. */
export const KW_M_PER_BTU_FT_S = 1055.05585262 / M_PER_FT / 1000;
/** m/s per ft/min. */
const MPS_PER_FT_MIN = M_PER_FT / 60;
/** m/s per mile/hour. */
export const MPS_PER_MPH = 0.44704;
/** Oven-dry particle density, lb/ft³ (Albini 1976). */
const PARTICLE_DENSITY = 32;
/** Total mineral content (Albini 1976). */
const TOTAL_SILICA = 0.0555;
/** Effective (silica-free) mineral content (Albini 1976). */
const EFFECTIVE_SILICA = 0.01;
/** 10-h and 100-h dead fuel surface-area-to-volume ratios, 1/ft (Albini 1976). */
const TEN_HOUR_SAVR = 109;
const HUNDRED_HOUR_SAVR = 30;

/**
 * A fuel bed reduced to the wind- and slope-independent terms of Rothermel's model. Compute it once
 * per fuel and moisture, then spread it under any wind and slope with {@link surfaceSpread}.
 */
export interface SurfaceFuelbed {
  /** True when the bed carries fire: some load, and dead or live moisture under extinction. */
  burnable: boolean;
  /** No-wind, no-slope rate of spread R0, m/s. */
  noWindNoSlopeRate: number;
  /** Reaction intensity I_R, kW/m². */
  reactionIntensity: number;
  /** Flame residence time t_r = 384/σ (Anderson 1969), s. */
  residenceTime: number;
  /** Heat released per unit area I_R·t_r, kJ/m². */
  heatPerUnitArea: number;
  /** Characteristic surface-area-to-volume ratio σ, 1/m. */
  characteristicSavr: number;
  /** Packing ratio β. */
  packingRatio: number;
  /** β / β_op. */
  relativePackingRatio: number;
  /** Characteristic dead moisture, fraction. */
  deadMoisture: number;
  /** Characteristic live moisture, fraction. */
  liveMoisture: number;
  /** Live moisture of extinction (Albini 1976), fraction. */
  liveExtinctionMoisture: number;
  /** Dead fuel load after dynamic curing (including cured herbs), kg/m². */
  deadLoad: number;
  /** Live fuel load after dynamic curing, kg/m². */
  liveLoad: number;
  /** Heat sink ρ_b·ε·Q_ig, Btu/ft³ (English, as Rothermel 1972 states it). */
  heatSink: number;
  /** Propagating flux ratio ξ. */
  propagatingFluxRatio: number;
  /** Wind coefficient C, exponent B and E of φ_w = C·U^B·(β/β_op)^-E (U in ft/min). */
  windC: number;
  windB: number;
  windE: number;
  /** Slope factor coefficient: φ_s = slopeK·tan²θ. */
  slopeK: number;
  /** Reaction intensity, Btu/ft²/min (Rothermel's units, kept for the wind limit). */
  reactionIntensityEnglish: number;
}

interface Particle {
  load: number;
  savr: number;
  moisture: number;
  heat: number;
}

function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Albini 1976 size bins for weighting net load: σ ≥ 1200, 192, 96, 48, 16 (1/ft). */
function savrBin(savr: number): number {
  if (savr >= 1200) return 0;
  if (savr >= 192) return 1;
  if (savr >= 96) return 2;
  if (savr >= 48) return 3;
  if (savr >= 16) return 4;
  return -1;
}

interface LifeClass {
  area: number;
  areaWeights: number[];
  load: number;
  netLoad: number;
  savr: number;
  moisture: number;
  heat: number;
  silica: number;
}

function lifeClass(particles: readonly Particle[]): LifeClass {
  const areas = particles.map((p) => (p.load * p.savr) / PARTICLE_DENSITY);
  const area = sum(areas);
  const areaWeights = areas.map((a) => (area > 1e-7 ? a / area : 0));
  const binWeights = [0, 0, 0, 0, 0];
  particles.forEach((p, i) => {
    const bin = savrBin(p.savr);
    if (bin >= 0) binWeights[bin] = (binWeights[bin] ?? 0) + (areaWeights[i] ?? 0);
  });
  let netLoad = 0;
  let savr = 0;
  let moisture = 0;
  let heat = 0;
  let silica = 0;
  let load = 0;
  particles.forEach((p, i) => {
    const f = areaWeights[i] ?? 0;
    const bin = savrBin(p.savr);
    netLoad += (bin >= 0 ? (binWeights[bin] ?? 0) : 0) * p.load * (1 - TOTAL_SILICA);
    savr += f * p.savr;
    moisture += f * p.moisture;
    heat += f * p.heat;
    silica += f * EFFECTIVE_SILICA;
    load += p.load;
  });
  return { area, areaWeights, load, netLoad, savr, moisture, heat, silica };
}

function moistureDamping(moisture: number, extinction: number): number {
  if (extinction <= 0 || moisture >= extinction) return 0;
  const r = moisture / extinction;
  return 1 - 2.59 * r + 5.11 * r * r - 3.52 * r * r * r;
}

function mineralDamping(silica: number): number {
  const d = Math.pow(silica, 0.19);
  return d < 1e-6 ? 0 : Math.min(1, 0.174 / d);
}

function assertMoisture(m: FuelMoisture): void {
  for (const [key, value] of Object.entries(m)) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`fire moisture ${key} must be finite and nonnegative`);
  }
}

/**
 * Herbaceous load that has cured to dead in a dynamic fuel model: all of it at or below 30 % herb
 * moisture, none from about 120 % (Scott & Burgan 2005), on the line BehavePlus uses.
 *
 * @capability fire-herb-curing share of live herbs cured to dead fuel at a herb moisture (Scott & Burgan 2005)
 */
export function curedHerbFraction(liveHerbMoisture: number): number {
  if (liveHerbMoisture < 0.3) return 1;
  if (liveHerbMoisture <= 1.2) return Math.max(0, 1.333 - 1.11 * liveHerbMoisture);
  return 0;
}

/**
 * Reduce a fuel model at a moisture state to Rothermel's 1972 fuel bed terms, with Albini's 1976
 * corrections: size-class weighting of net load, the live moisture of extinction and the
 * computer-model forms of A and Γ'. Dynamic models first cure live herbs to dead.
 *
 * @capability fire-surface-fuelbed reduce a fuel model and moisture to Rothermel reaction intensity, residence time and no-wind spread rate
 */
export function surfaceFuelbed(fuel: FuelModel, moisture: FuelMoisture): SurfaceFuelbed {
  assertMoisture(moisture);
  const lb = (kgM2: number): number => kgM2 / KG_M2_PER_LB_FT2;
  const perFt = (perM: number): number => perM * M_PER_FT;
  const deadHeat = fuel.deadHeatKJPerKg / KJ_KG_PER_BTU_LB;
  const liveHeat = fuel.liveHeatKJPerKg / KJ_KG_PER_BTU_LB;
  const depth = fuel.depthM / M_PER_FT;
  const herbSavr = perFt(fuel.liveHerbSavr);

  let liveHerbLoad = lb(fuel.load.liveHerb);
  let curedHerbLoad = 0;
  if (fuel.dynamic && liveHerbLoad > 0) {
    curedHerbLoad = liveHerbLoad * curedHerbFraction(moisture.liveHerb);
    liveHerbLoad -= curedHerbLoad;
  }
  const dead: Particle[] = [
    { load: lb(fuel.load.oneHour), savr: perFt(fuel.oneHourSavr), moisture: moisture.oneHour, heat: deadHeat },
    { load: lb(fuel.load.tenHour), savr: TEN_HOUR_SAVR, moisture: moisture.tenHour, heat: deadHeat },
    { load: lb(fuel.load.hundredHour), savr: HUNDRED_HOUR_SAVR, moisture: moisture.hundredHour, heat: deadHeat },
    { load: curedHerbLoad, savr: herbSavr, moisture: moisture.oneHour, heat: deadHeat },
  ];
  const live: Particle[] = [
    { load: liveHerbLoad, savr: herbSavr, moisture: moisture.liveHerb, heat: liveHeat },
    { load: lb(fuel.load.liveWoody), savr: perFt(fuel.liveWoodySavr), moisture: moisture.liveWoody, heat: liveHeat },
  ];
  const d = lifeClass(dead);
  const l = lifeClass(live);
  const totalArea = d.area + l.area;
  const totalLoad = d.load + l.load;
  const deadExtinction = fuel.deadExtinctionMoisture;
  const empty: SurfaceFuelbed = {
    burnable: false,
    noWindNoSlopeRate: 0,
    reactionIntensity: 0,
    residenceTime: 0,
    heatPerUnitArea: 0,
    characteristicSavr: 0,
    packingRatio: 0,
    relativePackingRatio: 0,
    deadMoisture: d.moisture,
    liveMoisture: l.moisture,
    liveExtinctionMoisture: deadExtinction,
    deadLoad: d.load * KG_M2_PER_LB_FT2,
    liveLoad: l.load * KG_M2_PER_LB_FT2,
    heatSink: 0,
    propagatingFluxRatio: 0,
    windC: 0,
    windB: 0,
    windE: 0,
    slopeK: 0,
    reactionIntensityEnglish: 0,
  };
  if (totalArea <= 1e-7 || depth <= 0 || totalLoad <= 0) return empty;
  const fDead = d.area / totalArea;
  const fLive = 1 - fDead;

  // Live moisture of extinction, Albini 1976 p. 89.
  let liveExtinction = deadExtinction;
  if (l.load > 0) {
    let fineDead = 0;
    let fineDeadMoisture = 0;
    for (const p of dead) {
      if (p.savr <= 1e-7) continue;
      const w = p.load * Math.exp(-138 / p.savr);
      fineDead += w;
      fineDeadMoisture += w * p.moisture;
    }
    let fineLive = 0;
    for (const p of live) if (p.savr > 1e-7) fineLive += p.load * Math.exp(-500 / p.savr);
    const mfDead = fineDead > 1e-7 ? fineDeadMoisture / fineDead : 0;
    const ratio = fineLive > 1e-7 ? fineDead / fineLive : 0;
    liveExtinction = Math.max(deadExtinction, 2.9 * ratio * (1 - mfDead / deadExtinction) - 0.226);
  }

  const sigma = fDead * d.savr + fLive * l.savr;
  const bulkDensity = totalLoad / depth;
  let packing = 0;
  for (const p of [...dead, ...live]) packing += p.load / (depth * PARTICLE_DENSITY);
  const optimumPacking = 3.348 * Math.pow(sigma, -0.8189);
  const relativePacking = packing / optimumPacking;

  const a = 133 * Math.pow(sigma, -0.7913);
  const sigma15 = Math.pow(sigma, 1.5);
  const gammaMax = sigma15 / (495 + 0.0594 * sigma15);
  const gamma = gammaMax * Math.pow(relativePacking, a) * Math.exp(a * (1 - relativePacking));
  const reactionDead = gamma * d.netLoad * d.heat * moistureDamping(d.moisture, deadExtinction) * mineralDamping(d.silica);
  const reactionLive = l.load > 0 ? gamma * l.netLoad * l.heat * moistureDamping(l.moisture, liveExtinction) * mineralDamping(l.silica) : 0;
  const reaction = reactionDead + reactionLive;

  const fluxRatio = Math.exp((0.792 + 0.681 * Math.sqrt(sigma)) * (packing + 0.1)) / (192 + 0.2595 * sigma);
  let heatSink = 0;
  dead.forEach((p, i) => {
    if (p.savr > 1e-7) heatSink += fDead * (d.areaWeights[i] ?? 0) * (250 + 1116 * p.moisture) * Math.exp(-138 / p.savr);
  });
  live.forEach((p, i) => {
    if (p.savr > 1e-7) heatSink += fLive * (l.areaWeights[i] ?? 0) * (250 + 1116 * p.moisture) * Math.exp(-138 / p.savr);
  });
  heatSink *= bulkDensity;
  const r0 = heatSink > 1e-7 ? (reaction * fluxRatio) / heatSink : 0;
  const residenceMinutes = 384 / sigma;

  return {
    burnable: reaction > 0 && r0 > 0,
    noWindNoSlopeRate: r0 * MPS_PER_FT_MIN,
    reactionIntensity: reaction * KW_M2_PER_BTU_FT2_MIN,
    residenceTime: residenceMinutes * 60,
    heatPerUnitArea: reaction * KW_M2_PER_BTU_FT2_MIN * residenceMinutes * 60,
    characteristicSavr: sigma / M_PER_FT,
    packingRatio: packing,
    relativePackingRatio: relativePacking,
    deadMoisture: d.moisture,
    liveMoisture: l.moisture,
    liveExtinctionMoisture: liveExtinction,
    deadLoad: d.load * KG_M2_PER_LB_FT2,
    liveLoad: l.load * KG_M2_PER_LB_FT2,
    heatSink,
    propagatingFluxRatio: fluxRatio,
    windC: 7.47 * Math.exp(-0.133 * Math.pow(sigma, 0.55)),
    windB: 0.02526 * Math.pow(sigma, 0.54),
    windE: 0.715 * Math.exp(-0.000359 * sigma),
    slopeK: 5.275 * Math.pow(packing, -0.3),
    reactionIntensityEnglish: reaction,
  };
}

/**
 * How the effective wind speed is capped. `none` is BehavePlus's default; `rothermel1972` caps it at
 * 0.9·I_R ft/min; `andrews2013` uses the revised limit 96.8·I_R^(1/3) ft/min (Andrews, Cruz &
 * Rothermel 2013).
 */
export type WindLimit = "none" | "rothermel1972" | "andrews2013";

/** Wind and terrain under which a fuel bed spreads. */
export interface SpreadConditions {
  /** Midflame wind speed, m/s. */
  midflameWind: number;
  /** Direction the wind blows towards, radians from the upslope direction. */
  windAngle: number;
  /** Slope steepness as rise over run (tan of the slope angle). */
  slope: number;
  windLimit?: WindLimit;
}

/** The head of a surface fire: its rate, direction, intensity and the ellipse it grows in. */
export interface SurfaceSpread {
  /** Head fire rate of spread, m/s. */
  headRate: number;
  /** Backing fire rate, m/s. */
  backingRate: number;
  /** Flanking fire rate (half the ellipse width per unit time), m/s. */
  flankingRate: number;
  /** Direction of maximum spread, radians from upslope in the same rotational sense as `windAngle`. */
  headingAngle: number;
  /** Wind factor φ_w and slope factor φ_s. */
  windFactor: number;
  slopeFactor: number;
  /** Wind speed that alone would drive the combined wind and slope spread, m/s. */
  effectiveWind: number;
  /** True when the wind limit capped the spread. */
  windLimited: boolean;
  /** Ellipse length-to-breadth ratio (Anderson 1983) and its eccentricity. */
  lengthToBreadth: number;
  eccentricity: number;
  /** Byram fireline intensity at the head, kW/m. */
  firelineIntensity: number;
  /** Byram flame length at the head, m. */
  flameLength: number;
}

const FT_MIN_PER_MPS = 1 / MPS_PER_FT_MIN;

/**
 * Anderson 1983 length-to-breadth ratio of a wind-driven surface fire from the midflame effective
 * wind (m/s), in the mile-per-hour form BehavePlus and Andrews 2018 publish, capped at 8.
 *
 * @capability fire-length-to-breadth Anderson 1983 surface fire ellipse shape from effective wind
 */
export function surfaceLengthToBreadth(effectiveWind: number): number {
  if (effectiveWind <= 1e-9) return 1;
  const u = effectiveWind / MPS_PER_MPH;
  const lb = 0.936 * Math.exp(0.1147 * u) + 0.461 * Math.exp(-0.0692 * u) - 0.397;
  return Math.min(8, Math.max(1, lb));
}

/**
 * Eccentricity of a fire ellipse with length-to-breadth ratio `lb`.
 *
 * @capability fire-ellipse-eccentricity eccentricity of a fire ellipse from its length-to-breadth ratio
 */
export function ellipseEccentricity(lb: number): number {
  const x = lb * lb - 1;
  return x > 0 ? Math.sqrt(x) / lb : 0;
}

/**
 * Byram 1959 fireline intensity I = H·R, kW/m, from heat per unit area (kJ/m²) and spread rate (m/s).
 *
 * @capability fire-byram-intensity Byram fireline intensity from heat per unit area and spread rate
 */
export function firelineIntensity(heatPerUnitArea: number, rate: number): number {
  return heatPerUnitArea * rate;
}

/**
 * Byram 1959 flame length L = 0.45·I^0.46 (ft, Btu/ft/s), in metres from kW/m.
 *
 * @capability fire-flame-length Byram flame length from fireline intensity
 */
export function flameLength(firelineIntensityKWm: number): number {
  const i = firelineIntensityKWm / KW_M_PER_BTU_FT_S;
  return i < 1e-7 ? 0 : 0.45 * Math.pow(i, 0.46) * M_PER_FT;
}

/**
 * Fireline intensity (kW/m) that gives a flame length (m); the inverse of {@link flameLength}.
 *
 * @capability fire-intensity-for-flame fireline intensity that gives a flame length
 */
export function intensityForFlameLength(flameLengthM: number): number {
  if (flameLengthM <= 0) return 0;
  return Math.pow(flameLengthM / M_PER_FT / 0.45, 1 / 0.46) * KW_M_PER_BTU_FT_S;
}

/**
 * Van Wagner 1973 crown scorch height, m, from fireline intensity (kW/m), midflame wind (m/s) and air
 * temperature (°C).
 *
 * @capability fire-scorch-height Van Wagner crown scorch height from intensity, wind and air temperature
 */
export function scorchHeight(firelineIntensityKWm: number, midflameWind: number, airTemperatureC: number): number {
  const i = firelineIntensityKWm / KW_M_PER_BTU_FT_S;
  if (i < 1e-7) return 0;
  const u = midflameWind / MPS_PER_MPH;
  const tF = airTemperatureC * 1.8 + 32;
  return ((63 / (140 - tF)) * Math.pow(i, 7 / 6)) / Math.sqrt(i + u * u * u) * M_PER_FT;
}

/**
 * Spread a fuel bed under wind and slope: Rothermel's wind and slope factors combined as vectors
 * (Albini & Chase 1980, as in BehavePlus), the effective wind speed, the Anderson 1983 ellipse and
 * Byram intensity and flame length at the head.
 *
 * @capability fire-surface-spread Rothermel 1972 surface fire rate, heading, ellipse, Byram intensity and flame length under wind and slope
 */
export function surfaceSpread(bed: SurfaceFuelbed, conditions: SpreadConditions): SurfaceSpread {
  const { midflameWind, windAngle, slope } = conditions;
  if (!Number.isFinite(midflameWind) || midflameWind < 0) throw new Error("fire midflameWind must be finite and nonnegative");
  if (!Number.isFinite(windAngle)) throw new Error("fire windAngle must be finite");
  if (!Number.isFinite(slope) || slope < 0) throw new Error("fire slope must be finite and nonnegative");
  if (!bed.burnable) {
    return { headRate: 0, backingRate: 0, flankingRate: 0, headingAngle: 0, windFactor: 0, slopeFactor: 0, effectiveWind: 0, windLimited: false, lengthToBreadth: 1, eccentricity: 0, firelineIntensity: 0, flameLength: 0 };
  }
  const r0 = bed.noWindNoSlopeRate * FT_MIN_PER_MPS;
  const u = midflameWind * FT_MIN_PER_MPS;
  const ratioE = Math.pow(bed.relativePackingRatio, -bed.windE);
  const phiW = u > 1e-7 ? bed.windC * Math.pow(u, bed.windB) * ratioE : 0;
  const phiS = bed.slopeK * slope * slope;

  const slopeRate = r0 * phiS;
  const windRate = r0 * phiW;
  const x = slopeRate + windRate * Math.cos(windAngle);
  const y = windRate * Math.sin(windAngle);
  const vector = Math.hypot(x, y);
  let head = r0 + vector;
  const heading = vector > 0 ? Math.atan2(y, x) : 0;
  const phiE = head / r0 - 1;
  let effective = phiE > 0 ? Math.pow((phiE / ratioE) / bed.windC, 1 / bed.windB) : 0;

  const limit = conditions.windLimit ?? "none";
  let windLimited = false;
  if (limit !== "none") {
    const cap = limit === "rothermel1972" ? 0.9 * bed.reactionIntensityEnglish : 96.8 * Math.cbrt(bed.reactionIntensityEnglish);
    if (effective > cap) {
      windLimited = true;
      effective = cap;
      head = r0 * (1 + bed.windC * Math.pow(cap, bed.windB) * ratioE);
    }
  }

  const effectiveMps = effective * MPS_PER_FT_MIN;
  const lb = surfaceLengthToBreadth(effectiveMps);
  const e = ellipseEccentricity(lb);
  const headMps = head * MPS_PER_FT_MIN;
  const backing = (headMps * (1 - e)) / (1 + e);
  const flanking = (headMps + backing) / (2 * lb);
  const intensity = firelineIntensity(bed.heatPerUnitArea, headMps);
  return {
    headRate: headMps,
    backingRate: backing,
    flankingRate: flanking,
    headingAngle: heading,
    windFactor: phiW,
    slopeFactor: phiS,
    effectiveWind: effectiveMps,
    windLimited,
    lengthToBreadth: lb,
    eccentricity: e,
    firelineIntensity: intensity,
    flameLength: flameLength(intensity),
  };
}

/**
 * Rate at which the fire front advances along its outward normal at `angle` radians from the heading,
 * for the ellipse of `spread` (the support function of the ellipse; BehavePlus's "from perimeter"
 * rate). Huygens-type growth models advance the front at this rate.
 *
 * @capability fire-normal-spread rate a fire front advances along its normal at any angle from the head
 */
export function normalSpreadRate(spread: SurfaceSpread, angle: number): number {
  if (spread.headRate <= 0) return 0;
  const f = (spread.headRate + spread.backingRate) / 2;
  const g = spread.headRate - f;
  const h = spread.flankingRate;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return g * c + Math.sqrt(f * f * c * c + h * h * s * s);
}

/**
 * Rate at which the fire travels along a ray at `angle` radians from the heading, measured from the
 * ignition point at the rear focus of the ellipse (BehavePlus's "from ignition point" rate).
 *
 * @capability fire-ray-spread rate a fire travels along a ray from its ignition point
 */
export function rayFromIgnitionRate(spread: SurfaceSpread, angle: number): number {
  if (spread.headRate <= 0) return 0;
  const e = spread.eccentricity;
  return (spread.headRate * (1 - e)) / (1 - e * Math.cos(angle));
}
