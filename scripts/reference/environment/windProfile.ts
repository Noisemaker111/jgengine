/**
 * Reference wind over flat terrain, written straight from EN 1991-1-4:2005 (Eurocode 1, Actions on structures — Wind
 * actions), independent of the runtime field: the roughness factor and logarithmic profile (§4.3.2), the turbulence
 * intensity (§4.4), and the along-wind turbulence length scale and spectrum (Annex B). The published values it must
 * reproduce are in {@link EN1991_TERRAIN} and {@link EN1991_PUBLISHED}.
 */

export const VON_KARMAN = 0.41;

export interface TerrainCategory {
  label: string;
  z0: number;
  zMin: number;
}

export const EN1991_TERRAIN = {
  openWater: { label: "0 sea or coastal area", z0: 0.003, zMin: 1 },
  grass: { label: "II low vegetation such as grass", z0: 0.05, zMin: 2 },
  forest: { label: "III regular cover of vegetation, villages, forests", z0: 0.3, zMin: 5 },
  city: { label: "IV at least 15 % covered with buildings", z0: 1, zMin: 10 },
} as const satisfies Record<string, TerrainCategory>;

export const Z0_II = 0.05;

/**
 * Values printed in, or read directly off, EN 1991-1-4 and its commentaries that this module must reproduce:
 * k_r per category (eq. 4.5, tabulated in national annexes and the JRC worked examples), I_v at 10 m, the length scale
 * at 10 m over category II, and c_e(10 m) for category II from Figure 4.2 (c₀ = 1).
 */
export const EN1991_PUBLISHED = {
  terrainFactor: { openWater: 0.156, grass: 0.19, forest: 0.215, city: 0.234 },
  intensityAt10m: { openWater: 0.123, grass: 0.189, forest: 0.285, city: 0.434 },
  lengthScaleAt10mGrass: 63.1,
  exposureAt10mGrass: 2.35,
  spectrumPeak: { fL: 0.147, value: 0.217 },
} as const;

function zEff(category: TerrainCategory, z: number): number {
  return Math.max(category.zMin, z);
}

export function terrainFactor(category: TerrainCategory): number {
  return 0.19 * (category.z0 / Z0_II) ** 0.07;
}

export function roughnessFactor(category: TerrainCategory, z: number): number {
  return terrainFactor(category) * Math.log(zEff(category, z) / category.z0);
}

export function logLawRatio(category: TerrainCategory, z: number, zRef = 10): number {
  return roughnessFactor(category, z) / roughnessFactor(category, zRef);
}

export function frictionVelocity(category: TerrainCategory, meanAtRef: number, zRef = 10): number {
  return (VON_KARMAN * meanAtRef) / Math.log(zEff(category, zRef) / category.z0);
}

export function turbulenceIntensity(category: TerrainCategory, z: number): number {
  return 1 / Math.log(zEff(category, z) / category.z0);
}

export function exposureFactor(category: TerrainCategory, z: number): number {
  return roughnessFactor(category, z) ** 2 * (1 + 7 * turbulenceIntensity(category, z));
}

export function turbulenceLength(category: TerrainCategory, z: number): number {
  const alpha = 0.67 + 0.05 * Math.log(category.z0);
  return 300 * (zEff(category, z) / 200) ** alpha;
}

export function spectralDensity(fL: number): number {
  return (6.8 * fL) / (1 + 10.2 * fL) ** (5 / 3);
}

export function spectralShare(a: number, b: number, steps = 4000): number {
  const la = Math.log(a);
  const lb = Math.log(b);
  const h = (lb - la) / steps;
  let sum = 0;
  for (let k = 0; k <= steps; k += 1) {
    const w = k === 0 || k === steps ? 1 : k % 2 === 1 ? 4 : 2;
    // d(ln f) = df/f, so S_L(f)/f df = S_L(f) d(ln f).
    sum += w * spectralDensity(Math.exp(la + k * h));
  }
  return (sum * h) / 3;
}

/**
 * Variance of the gust averaged over a window of `seconds`, as a share of σ²: ∫ S_L/f · sinc²(π n T) df, n = f_L U / L.
 * A gust's short-window variance is what a body of that response time feels, so it checks the spectrum's shape.
 */
export function windowedShare(category: TerrainCategory, z: number, meanSpeed: number, seconds: number, steps = 8000): number {
  const length = turbulenceLength(category, z);
  const la = Math.log(1e-5);
  const lb = Math.log(1e4);
  const h = (lb - la) / steps;
  let sum = 0;
  for (let k = 0; k <= steps; k += 1) {
    const w = k === 0 || k === steps ? 1 : k % 2 === 1 ? 4 : 2;
    const fL = Math.exp(la + k * h);
    const x = Math.PI * ((fL * meanSpeed) / length) * seconds;
    const sinc = x === 0 ? 1 : Math.sin(x) / x;
    sum += w * spectralDensity(fL) * sinc * sinc;
  }
  return (sum * h) / 3;
}
