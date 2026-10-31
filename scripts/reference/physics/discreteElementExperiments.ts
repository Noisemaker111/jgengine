// @skill jgengine-world
/**
 * The laboratory tests granular matter is characterised by, run on the {@link createDiscreteElements} reference:
 * a lifted-cylinder pile (angle of repose, dry and damp), a silo filled in layers (Janssen pressure saturation),
 * a flat-bottomed hopper (Beverloo discharge law), a binary collision (coefficient of restitution), and a shaken
 * bed with a large intruder (Brazil-nut segregation). Each returns the measured numbers, never a verdict.
 *
 * @capability granular-dem discrete element reference for sand, gravel and powders with Hertz–Mindlin contacts, rolling resistance and capillary cohesion
 */
import { seededRng, type SeededRng } from "@jgengine/core/random/rng";
import type { Vec3 } from "@jgengine/core/world/geometry";
import {
  bridgeVolumeFromMoisture,
  createDiscreteElements,
  type DemInteraction,
  type DemLiquid,
  type DemMaterial,
  type DemSnapshot,
  type DemWallShape,
  type DiscreteElements,
} from "./discreteElements";

/**
 * Natural quartz sand as DEM grains: solid density 2650 kg/m³, sliding friction 0.5 and restitution 0.55
 * (the measured ranges collected by Al-Hashemi & Al-Amoudi 2018), rolling resistance 0.7 standing in for angular
 * grain shape (Wensrich & Katterfeld 2012), contact stiffness lowered to 5 MPa as DEM practice does.
 */
export const DEM_SAND: DemMaterial = { id: "quartz-sand", density: 2650, youngsModulus: 5e6, poissonRatio: 0.3, restitution: 0.55, friction: 0.5, rollingFriction: 0.7 };

/** Soda-lime glass beads: restitution 0.97 and friction 0.092 measured by Foerster, Louge, Chang & Allia (1994). */
export const DEM_GLASS_BEADS: DemMaterial = { id: "glass-beads", density: 2500, youngsModulus: 5e6, poissonRatio: 0.22, restitution: 0.97, friction: 0.092, rollingFriction: 0 };

/** A rigid steel container wall (same simulation stiffness as the grains). */
export const DEM_STEEL: DemMaterial = { id: "steel", density: 7800, youngsModulus: 5e6, poissonRatio: 0.3, restitution: 0.6, friction: 0.4, rollingFriction: 0.1 };

/**
 * Capillary bridges of water on clean silica (surface tension 0.072 N/m, contact angle 0) at gravimetric `moisture`.
 * @capability granular-dem discrete element reference for sand, gravel and powders with Hertz–Mindlin contacts, rolling resistance and capillary cohesion
 */
export function waterBridges(moisture: number, grainRadius: number, solidDensity = DEM_SAND.density): DemLiquid {
  return { surfaceTension: 0.072, contactAngle: 0, bridgeVolume: bridgeVolumeFromMoisture(moisture, grainRadius, solidDensity) };
}

function lattice(dem: DiscreteElements, options: { center: Vec3; radius: number; bottom: number; count: number; grainRadius: number; spread: number; material: number; rng: SeededRng; halfWidth?: number }): number {
  const { center, radius, count, grainRadius, spread, material, rng } = options;
  const pitch = 2 * grainRadius * (1 + spread) * 1.05;
  const reach = radius - grainRadius * (1 + spread);
  let placed = 0;
  let top = options.bottom;
  for (let layer = 0; placed < count; layer += 1) {
    const y = options.bottom + grainRadius * (1 + spread) + layer * pitch;
    const shift = (layer % 2) * pitch * 0.5;
    const span = Math.ceil(reach / pitch) + 1;
    for (let i = -span; i <= span && placed < count; i += 1) {
      for (let k = -span; k <= span && placed < count; k += 1) {
        const x = i * pitch + shift;
        const z = k * pitch + shift;
        const inside = options.halfWidth === undefined ? x * x + z * z <= reach * reach : Math.abs(x) <= options.halfWidth - pitch / 2 && Math.abs(z) <= options.halfWidth - pitch / 2;
        if (!inside) continue;
        const jitter = (rng() - 0.5) * grainRadius * 0.1;
        dem.addBody({ position: [center[0] + x + jitter, y, center[2] + z - jitter], material, radius: grainRadius * (1 + spread * (2 * rng() - 1)) });
        placed += 1;
        top = y;
      }
    }
  }
  return top + pitch / 2;
}

/**
 * Run until the mean grain speed falls under `speed` m/s or `limit` seconds pass. Returns the time spent.
 * @capability granular-dem discrete element reference for sand, gravel and powders with Hertz–Mindlin contacts, rolling resistance and capillary cohesion
 */
export function settleGrains(dem: DiscreteElements, speed = 0.005, limit = 1): number {
  let spent = 0;
  while (spent < limit) {
    dem.run(0.02);
    spent += 0.02;
    let sum = 0;
    let count = 0;
    for (let b = 0; b < dem.bodyCount; b += 1) {
      if (dem.active[b] !== 1 || dem.fixed[b] === 1) continue;
      sum += Math.hypot(dem.vx[b] ?? 0, dem.vy[b] ?? 0, dem.vz[b] ?? 0);
      count += 1;
    }
    if (count === 0 || sum / count < speed) break;
  }
  return spent;
}

/** Options for {@link pouredCone}. */
export interface PouredConeOptions {
  material?: DemMaterial;
  liquid?: DemLiquid;
  /** Grains poured. Default 900. */
  grains?: number;
  /** Mean grain radius, m. Default 5 mm. */
  grainRadius?: number;
  /** Radius of the glued-grain base disc, in grain radii. Default 16. */
  baseRadius?: number;
  /** Seconds between batches of 14 grains. Default 0.03. */
  interval?: number;
  seed?: string;
}

/** A cone poured onto a fixed rough base. */
export interface PouredConeResult {
  /** Angle of repose from the apex height over the base radius, tan α = H / R (ISO 4324), degrees. */
  angle: number;
  /** Slope of the free surface fitted between the apex and the rim, degrees. */
  fittedAngle: number;
  /** Apex height above the base, m. */
  height: number;
  /** Base disc radius, m. */
  baseRadius: number;
  /** Length of the sloping surface, m. */
  slopeLength: number;
  /** Grains resting on the base. */
  grains: number;
  maxOverlap: number;
}

/**
 * Angle of repose by the fixed-base cone (the poured-heap method of ISO 4324 and Al-Hashemi & Al-Amoudi 2018): pour
 * grains slowly onto the axis of a disc of glued grains until the excess spills over the rim, then fit the cone.
 * @capability granular-dem discrete element reference for sand, gravel and powders with Hertz–Mindlin contacts, rolling resistance and capillary cohesion
 */
export function pouredCone(options: PouredConeOptions = {}): PouredConeResult {
  const r = options.grainRadius ?? 0.005;
  const count = options.grains ?? 900;
  const base = (options.baseRadius ?? 16) * r;
  const material = options.material ?? DEM_SAND;
  const rng = seededRng(options.seed ?? "cone");
  const span = base + 30 * r;
  const dem = createDiscreteElements({
    materials: [material],
    domain: { min: [-span, -r, -span], max: [span, 400 * r, span] },
    maxBodies: count + Math.ceil((base * base * Math.PI) / (3.4 * r * r)) + 8,
    ...(options.liquid === undefined ? {} : { liquid: options.liquid }),
  });
  const floor = roughFloor(dem, base, r, 0);
  const interval = options.interval ?? 0.02;
  const pitch = 2.4 * r;
  let poured = 0;
  let worst = 0;
  while (poured < count) {
    // The stream lands on the apex of the resting grains; slots still occupied by falling grains wait a batch.
    let apex = 2 * r;
    for (let b = floor; b < dem.bodyCount; b += 1) {
      if (dem.active[b] !== 1 || Math.hypot(dem.px[b] ?? 0, dem.pz[b] ?? 0) > 4 * r) continue;
      if (Math.hypot(dem.vx[b] ?? 0, dem.vy[b] ?? 0, dem.vz[b] ?? 0) > 0.1) continue;
      apex = Math.max(apex, (dem.py[b] ?? 0) + r);
    }
    for (let layer = 0; layer < 4 && poured < count; layer += 1) {
      for (let k = 0; k < 7 && poured < count; k += 1) {
        const angle = (k * Math.PI) / 3 + layer;
        const reach = k === 0 ? 0 : pitch;
        const x = reach * Math.cos(angle) + (rng() - 0.5) * 0.2 * r;
        const y = apex + 3 * r + layer * pitch;
        const z = reach * Math.sin(angle);
        if (!clear(dem, x, y, z, pitch)) continue;
        dem.addBody({ position: [x, y, z], velocity: [0, -0.4, 0], material: 0, radius: r * (0.9 + 0.2 * rng()) });
        poured += 1;
      }
    }
    worst = Math.max(worst, dem.run(interval).maxOverlap);
  }
  settleGrains(dem, 0.002, 1);
  worst = Math.max(worst, dem.run(0.02).maxOverlap);
  const cone = measureCone(dem, r, floor, 2 * r, base);
  let resting = 0;
  for (let b = floor; b < dem.bodyCount; b += 1) if (dem.active[b] === 1) resting += 1;
  return { ...cone, grains: resting, maxOverlap: worst };
}

/** Options for {@link collapsedColumn}. */
export interface ColumnCollapseOptions {
  material?: DemMaterial;
  grainRadius?: number;
  /** Column height over radius, a = h_i / r_i. */
  aspect: number;
  /** Column radius in grain radii. Default 10. */
  columnRadius?: number;
  seed?: string;
}

/** Where a released column came to rest. */
export interface ColumnCollapseResult {
  /** Column radius and settled height before release, m. */
  initialRadius: number;
  initialHeight: number;
  /** Radius of the deposit's edge, the farthest grain once still, m (Lube et al. measured the edge). */
  runout: number;
  /** Highest grain top once still, m. */
  finalHeight: number;
  /** Seconds from release until the grains stopped. */
  duration: number;
}

/**
 * A cylinder of grains on a rough floor, released by lifting its frictionless wall away fast: the axisymmetric
 * collapse of Lube, Huppert, Sparks & Hallworth (2004), who measured r_∞/r_i = 1 + 1.24 a for a < 1.7.
 * @capability granular-dem discrete element reference for sand, gravel and powders with Hertz–Mindlin contacts, rolling resistance and capillary cohesion
 */
export function collapsedColumn(options: ColumnCollapseOptions): ColumnCollapseResult {
  const r = options.grainRadius ?? 0.005;
  const ri = (options.columnRadius ?? 10) * r;
  const material = options.material ?? DEM_SAND;
  const rng = seededRng(options.seed ?? "column");
  const reachFactor = options.aspect < 1.7 ? 1 + 1.24 * options.aspect : 1 + 1.6 * Math.sqrt(options.aspect);
  const floorRadius = ri * reachFactor * 1.6 + 4 * r;
  const target = options.aspect * ri;
  const count = Math.ceil((0.6 * Math.PI * ri * ri * target) / ((4 / 3) * Math.PI * r * r * r));
  const span = floorRadius + 10 * r;
  const dem = createDiscreteElements({
    materials: [material, DEM_STEEL],
    interactions: [{ a: 0, b: 1, friction: 0, rollingFriction: 0 }],
    walls: [{ kind: "cylinder", center: [0, 0, 0], axis: [0, 1, 0], radius: ri, length: 4 * target + 20 * r, material: 1 }],
    domain: { min: [-span, -r, -span], max: [span, 20 * target + 200 * r, span] },
    maxBodies: count + Math.ceil((floorRadius * floorRadius * Math.PI) / (3.4 * r * r)) + 8,
  });
  const floor = roughFloor(dem, floorRadius, r, 0);
  lattice(dem, { center: [0, 0, 0], radius: ri, bottom: 2 * r, count, grainRadius: r, spread: 0.1, material: 0, rng });
  settleGrains(dem, 0.003, 1.5);
  let height = 0;
  for (let b = floor; b < dem.bodyCount; b += 1) height = Math.max(height, (dem.py[b] ?? 0) + (dem.sphereRadius[b] ?? 0) - 2 * r);
  // Lift the wall clear in a few hundredths of a second, faster than the column can move.
  dem.setWallMotion(0, { velocity: [0, Math.max(2, 40 * height), 0] });
  let duration = 0;
  for (let k = 0; k < 400; k += 1) {
    dem.run(0.01);
    duration += 0.01;
    if (duration < 0.1) continue;
    let fastest = 0;
    for (let b = floor; b < dem.bodyCount; b += 1) if (dem.active[b] === 1) fastest = Math.max(fastest, Math.hypot(dem.vx[b] ?? 0, dem.vy[b] ?? 0, dem.vz[b] ?? 0));
    if (fastest < 0.02) break;
  }
  let edge = 0;
  let top = 0;
  for (let b = floor; b < dem.bodyCount; b += 1) {
    if (dem.active[b] !== 1) continue;
    edge = Math.max(edge, Math.hypot(dem.px[b] ?? 0, dem.pz[b] ?? 0) + (dem.sphereRadius[b] ?? 0));
    top = Math.max(top, (dem.py[b] ?? 0) + (dem.sphereRadius[b] ?? 0) - 2 * r);
  }
  return { initialRadius: ri, initialHeight: height, runout: edge, finalHeight: top, duration };
}

function clear(dem: DiscreteElements, x: number, y: number, z: number, gap: number): boolean {
  for (let b = 0; b < dem.bodyCount; b += 1) {
    if (dem.active[b] !== 1) continue;
    if (((dem.px[b] ?? 0) - x) ** 2 + ((dem.py[b] ?? 0) - y) ** 2 + ((dem.pz[b] ?? 0) - z) ** 2 < gap * gap) return false;
  }
  return true;
}

/** A hexagonal layer of fixed grains of radius `r` on the plane y = 0 out to `radius`: the glued-grain floor of a lab pile test. Returns how many it placed. */
function roughFloor(dem: DiscreteElements, radius: number, r: number, material: number): number {
  let placed = 0;
  const rowPitch = Math.sqrt(3) * r;
  const rows = Math.ceil(radius / rowPitch);
  for (let j = -rows; j <= rows; j += 1) {
    const z = j * rowPitch;
    const shift = (Math.abs(j) % 2) * r;
    const cols = Math.ceil(radius / (2 * r)) + 1;
    for (let i = -cols; i <= cols; i += 1) {
      const x = i * 2 * r + shift;
      if (x * x + z * z > radius * radius) continue;
      dem.addBody({ position: [x, r, z], material, radius: r, fixed: true });
      placed += 1;
    }
  }
  return placed;
}

function measureCone(dem: DiscreteElements, r: number, firstBody: number, floorTop: number, base: number): Omit<PouredConeResult, "grains" | "maxOverlap"> {
  const bin = 2 * r;
  const tops: number[] = [];
  for (let s = 0; s < dem.sphereCount; s += 1) {
    const body = dem.sphereBody[s] ?? 0;
    if (body < firstBody || dem.active[body] !== 1) continue;
    const rho = Math.hypot(dem.sx[s] ?? 0, dem.sz[s] ?? 0);
    if (rho > base) continue;
    const k = Math.floor(rho / bin);
    const y = (dem.sy[s] ?? 0) + (dem.sphereRadius[s] ?? 0) - floorTop;
    tops[k] = Math.max(tops[k] ?? 0, y);
  }
  // Apex height from the two central rings, so one perched grain does not set it.
  const height = ((tops[0] ?? 0) + (tops[1] ?? 0)) / 2;
  // The surface: the top grain in each of 12 sectors × radius-wide rings, fitted between the apex ring and the rim ring.
  const sectors = 12;
  const rings = Math.ceil(base / r);
  const surface = new Float64Array(sectors * rings).fill(-1);
  for (let s = 0; s < dem.sphereCount; s += 1) {
    const body = dem.sphereBody[s] ?? 0;
    if (body < firstBody || dem.active[body] !== 1) continue;
    const x = dem.sx[s] ?? 0;
    const z = dem.sz[s] ?? 0;
    const ring = Math.floor(Math.hypot(x, z) / r);
    if (ring >= rings) continue;
    const sector = Math.min(sectors - 1, Math.floor(((Math.atan2(z, x) + Math.PI) / (2 * Math.PI)) * sectors));
    const at = sector * rings + ring;
    surface[at] = Math.max(surface[at] ?? -1, (dem.sy[s] ?? 0) + (dem.sphereRadius[s] ?? 0) - floorTop);
  }
  const xs: number[] = [];
  const ys: number[] = [];
  for (let sector = 0; sector < sectors; sector += 1) {
    for (let ring = 2; ring < rings - 2; ring += 1) {
      const y = surface[sector * rings + ring] ?? -1;
      if (y <= 0) continue;
      xs.push((ring + 0.5) * r);
      ys.push(y);
    }
  }
  const { slope } = linearFit(xs, ys);
  return { angle: (Math.atan(height / base) * 180) / Math.PI, fittedAngle: (Math.atan(-slope) * 180) / Math.PI, height, baseRadius: base, slopeLength: Math.hypot(base, height) };
}

/** Least-squares line through points. @internal */
export function linearFit(xs: readonly number[], ys: readonly number[]): { slope: number; intercept: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0 };
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i += 1) {
    mx += xs[i] ?? 0;
    my += ys[i] ?? 0;
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = (xs[i] ?? 0) - mx;
    sxy += dx * ((ys[i] ?? 0) - my);
    sxx += dx * dx;
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  return { slope, intercept: my - slope * mx };
}

/**
 * Excess avalanche angle a damp pile gains over the dry one, after Nowak, Samadani & Kudrolli (2005):
 * θ_m − θ_d = √((9π/2f_p)^{1/3} α₀ cos θ_d Γ / (√6 tan θ_d ρ g r L)), α₀ = 1.2, f_p = 0.64. Radians.
 * @capability granular-dem discrete element reference for sand, gravel and powders with Hertz–Mindlin contacts, rolling resistance and capillary cohesion
 */
export function nowakExcessAngle(dryAngle: number, surfaceTension: number, density: number, grainRadius: number, slopeLength: number, gravity = 9.81): number {
  const packing = 0.64;
  const alpha = 1.2;
  const radicand = (Math.cbrt((9 * Math.PI) / (2 * packing)) * alpha * Math.cos(dryAngle) * surfaceTension) / (Math.sqrt(6) * Math.tan(dryAngle) * density * gravity * grainRadius * slopeLength);
  return Math.sqrt(Math.max(0, radicand));
}

/** Options for {@link janssenSilo}. */
export interface SiloOptions {
  material?: DemMaterial;
  grainRadius?: number;
  /** Silo radius in grain radii. Default 8. */
  siloRadius?: number;
  /** Grains per filling layer. Default 100. */
  batch?: number;
  batches?: number;
  /** Grain–wall friction. Default 0.7. */
  wallFriction?: number;
  seed?: string;
}

/** Base load against filled mass, kg, for each filling stage. */
export interface SiloResult {
  fillMass: number[];
  apparentMass: number[];
  /** Fitted Janssen curve, {@link janssenLoad}. */
  fit: JanssenFit;
  /** Janssen stress ratio K = ρ_b π R³ / (2 μ_w M_∞) from the fitted M_∞, the measured bulk density and the wall friction. */
  stressRatio: number;
  bulkDensity: number;
  wallFriction: number;
  /** Wall shear over wall normal force in the full silo: the friction Janssen's wall actually mobilizes. */
  mobilizedFriction: number;
}

/**
 * A silo filled layer by layer, weighing its base after each layer settles (the experiment of Vanel & Clément 1999):
 * Janssen (1895) predicts the base carries M_∞ (1 − e^{−M/M_∞}) as wall friction takes the rest, above a bottom zone
 * that rests on the base in full.
 * @capability granular-dem discrete element reference for sand, gravel and powders with Hertz–Mindlin contacts, rolling resistance and capillary cohesion
 */
export function janssenSilo(options: SiloOptions = {}): SiloResult {
  const r = options.grainRadius ?? 0.005;
  const rs = (options.siloRadius ?? 8) * r;
  const batch = options.batch ?? 100;
  const batches = options.batches ?? 10;
  const wallFriction = options.wallFriction ?? 0.7;
  const material = options.material ?? DEM_SAND;
  const rng = seededRng(options.seed ?? "silo");
  const dem = createDiscreteElements({
    materials: [material, DEM_STEEL],
    interactions: [{ a: 0, b: 1, friction: wallFriction, rollingFriction: material.rollingFriction }],
    walls: [
      { kind: "plane", point: [0, 0, 0], normal: [0, 1, 0], material: 1 },
      { kind: "cylinder", center: [0, -r, 0], axis: [0, 1, 0], radius: rs, length: 1000 * r, material: 1 },
    ],
    domain: { min: [-rs - r, -2 * r, -rs - r], max: [rs + r, 1000 * r, rs + r] },
    maxBodies: batch * batches,
  });
  const fillMass: number[] = [];
  const apparentMass: number[] = [];
  let surface = 0;
  let drag = 0;
  let normal = 0;
  for (let stage = 0; stage < batches; stage += 1) {
    lattice(dem, { center: [0, 0, 0], radius: rs, bottom: surface + 2 * r, count: batch, grainRadius: r, spread: 0.1, material: 0, rng });
    settleGrains(dem, 0.004, 0.6);
    // Average the base load over a short window to smooth contact chatter.
    let load = 0;
    drag = 0;
    normal = 0;
    const samples = 20;
    for (let k = 0; k < samples; k += 1) {
      dem.step();
      load += dem.wallForce[1] ?? 0;
      drag -= dem.wallForce[4] ?? 0;
      normal += dem.wallNormalForce[1] ?? 0;
    }
    let mass = 0;
    surface = 0;
    for (let b = 0; b < dem.bodyCount; b += 1) {
      mass += dem.mass[b] ?? 0;
      surface = Math.max(surface, dem.py[b] ?? 0);
    }
    fillMass.push(mass);
    apparentMass.push(-load / samples / 9.81);
  }
  const fit = fitJanssen(fillMass, apparentMass);
  // Bulk density over the lower 80% of the column, below the loose surface.
  let height = 0;
  for (let b = 0; b < dem.bodyCount; b += 1) height = Math.max(height, (dem.py[b] ?? 0) + (dem.sphereRadius[b] ?? 0));
  let volume = 0;
  for (let b = 0; b < dem.bodyCount; b += 1) if ((dem.py[b] ?? 0) < 0.8 * height) volume += (4 / 3) * Math.PI * (dem.sphereRadius[b] ?? 0) ** 3;
  const bulkDensity = (volume * material.density) / (Math.PI * rs * rs * 0.8 * height);
  const mobilized = normal > 0 ? drag / normal : wallFriction;
  // Above the hydrostatic zone the wall friction is fully mobilized (Vanel & Clément 1999).
  return { fillMass, apparentMass, fit, stressRatio: (bulkDensity * Math.PI * rs ** 3) / (2 * wallFriction * fit.saturationMass), bulkDensity, wallFriction, mobilizedFriction: mobilized };
}

/** A fitted Janssen curve with the hydrostatic zone of Vanel & Clément (1999). */
export interface JanssenFit {
  /** Fill mass the base carries in full before the wall takes load, kg. */
  hydrostaticMass: number;
  /** Saturation mass M_∞, kg. */
  saturationMass: number;
}

/**
 * Base load of a silo holding `fill` kg: all of it up to the hydrostatic mass, then M_h + M_∞ (1 − e^{−(M − M_h)/M_∞}).
 * @capability granular-dem discrete element reference for sand, gravel and powders with Hertz–Mindlin contacts, rolling resistance and capillary cohesion
 */
export function janssenLoad(fill: number, fit: JanssenFit): number {
  if (fill <= fit.hydrostaticMass) return fill;
  return fit.hydrostaticMass + fit.saturationMass * (1 - Math.exp(-(fill - fit.hydrostaticMass) / fit.saturationMass));
}

/** Least-squares {@link JanssenFit} for (fill, apparent) pairs. @internal */
export function fitJanssen(fill: readonly number[], apparent: readonly number[]): JanssenFit {
  const error = (fit: JanssenFit): number => {
    let sum = 0;
    for (let i = 0; i < fill.length; i += 1) sum += (janssenLoad(fill[i] ?? 0, fit) - (apparent[i] ?? 0)) ** 2;
    return sum;
  };
  let most = 0;
  for (const m of fill) most = Math.max(most, m);
  let best: JanssenFit = { hydrostaticMass: 0, saturationMass: most };
  let bestError = Number.POSITIVE_INFINITY;
  for (let h = 0; h <= 40; h += 1) {
    const hydrostaticMass = (most * h) / 80;
    let lo = most * 0.01;
    let hi = most * 50;
    for (let k = 0; k < 120; k += 1) {
      const a = lo + (hi - lo) / 3;
      const b = hi - (hi - lo) / 3;
      if (error({ hydrostaticMass, saturationMass: a }) < error({ hydrostaticMass, saturationMass: b })) hi = b;
      else lo = a;
    }
    const fit = { hydrostaticMass, saturationMass: (lo + hi) / 2 };
    const e = error(fit);
    if (e < bestError) {
      bestError = e;
      best = fit;
    }
  }
  return best;
}

/** Options for {@link beverlooHopper}. */
export interface HopperOptions {
  material?: DemMaterial;
  grainRadius?: number;
  /** Orifice diameters in grain diameters. */
  orifices: readonly number[];
  /** Silo radius in grain radii. Default 16. */
  siloRadius?: number;
  grains?: number;
  /** Seconds discarded before measuring, then measured. */
  transient?: number;
  window?: number;
  seed?: string;
}

/** Steady mass discharge rates, kg/s, one per orifice. */
export interface HopperResult {
  orifices: number[];
  rates: number[];
  /** Rate over the first and second half of the window per orifice, a check that the rate does not depend on the head. */
  halves: [number, number][];
  bulkDensity: number;
  grainDiameter: number;
}

/**
 * Discharge of a flat-bottomed cylindrical silo through a round orifice, grains recycled to the top so the head stays
 * steady. Beverloo, Leniger & van de Velde (1961) predict W = C ρ_b √g (D − k d)^{5/2}, independent of the head.
 * @capability granular-dem discrete element reference for sand, gravel and powders with Hertz–Mindlin contacts, rolling resistance and capillary cohesion
 */
export function beverlooHopper(options: HopperOptions): HopperResult {
  const r = options.grainRadius ?? 0.005;
  const rs = (options.siloRadius ?? 16) * r;
  const count = options.grains ?? 1800;
  const material = options.material ?? DEM_SAND;
  const rng = seededRng(options.seed ?? "hopper");
  const dem = createDiscreteElements({
    materials: [material, DEM_STEEL],
    interactions: [{ a: 0, b: 1, friction: 0.4, rollingFriction: material.rollingFriction }],
    walls: [
      { kind: "disc", center: [0, 0, 0], normal: [0, 1, 0], innerRadius: 0, outerRadius: rs + 4 * r, material: 1 },
      { kind: "cylinder", center: [0, -r, 0], axis: [0, 1, 0], radius: rs, length: 2000 * r, material: 1 },
    ],
    domain: { min: [-rs - 8 * r, -12 * r, -rs - 8 * r], max: [rs + 8 * r, 2000 * r, rs + 8 * r] },
    maxBodies: count,
  });
  lattice(dem, { center: [0, 0, 0], radius: rs, bottom: 0, count, grainRadius: r, spread: 0.1, material: 0, rng });
  settleGrains(dem, 0.01, 1);
  const filled = dem.snapshot();
  let fillHeight = 0;
  let volume = 0;
  for (let b = 0; b < dem.bodyCount; b += 1) {
    fillHeight = Math.max(fillHeight, (dem.py[b] ?? 0) + (dem.sphereRadius[b] ?? 0));
    volume += (4 / 3) * Math.PI * (dem.sphereRadius[b] ?? 0) ** 3;
  }
  const bulkDensity = (volume * material.density) / (Math.PI * rs * rs * fillHeight);
  const transient = options.transient ?? 0.15;
  const window = options.window ?? 0.3;
  const rates: number[] = [];
  const halves: [number, number][] = [];
  for (const diameters of options.orifices) {
    const opened: DemSnapshot = { ...filled, walls: filled.walls.map((wall, index) => (index === 0 && wall.kind === "disc" ? { ...wall, innerRadius: diameters * r } : wall)) };
    dem.restore(opened);
    let first = 0;
    let second = 0;
    const steps = Math.round((transient + window) / dem.dt);
    const start = Math.round(transient / dem.dt);
    const middle = Math.round((transient + window / 2) / dem.dt);
    for (let i = 0; i < steps; i += 1) {
      const report = dem.step();
      for (const b of report.exited) {
        if (i >= start) {
          if (i < middle) first += dem.mass[b] ?? 0;
          else second += dem.mass[b] ?? 0;
        }
        const angle = rng() * Math.PI * 2;
        const radius = Math.sqrt(rng()) * (rs - 2 * r);
        dem.placeBody(b, [radius * Math.cos(angle), fillHeight + 2 * r * rng(), radius * Math.sin(angle)], [0, -0.5, 0]);
      }
    }
    rates.push((first + second) / window);
    halves.push([first / (window / 2), second / (window / 2)]);
  }
  return { orifices: [...options.orifices], rates, halves, bulkDensity, grainDiameter: 2 * r };
}

/**
 * Fit Beverloo's C and k to measured rates by least squares on W^{2/5} = (C ρ_b √g)^{2/5} (D − k d), which is linear in D.
 * @capability granular-dem discrete element reference for sand, gravel and powders with Hertz–Mindlin contacts, rolling resistance and capillary cohesion
 */
export function fitBeverloo(result: HopperResult, gravity = 9.81): { c: number; k: number } {
  const d = result.grainDiameter;
  const xs = result.orifices.map((n) => n * d);
  const ys = result.rates.map((rate) => Math.max(rate, 0) ** 0.4);
  const { slope, intercept } = linearFit(xs, ys);
  const c = slope ** 2.5 / (result.bulkDensity * Math.sqrt(gravity));
  const k = -intercept / slope / d;
  return { c, k };
}

/**
 * Normal coefficient of restitution measured from a head-on collision of two equal grains at `speed` each.
 * @capability granular-dem discrete element reference for sand, gravel and powders with Hertz–Mindlin contacts, rolling resistance and capillary cohesion
 */
export function measuredRestitution(material: DemMaterial, speed: number, grainRadius = 0.005): number {
  const dem = createDiscreteElements({ materials: [material], domain: { min: [-1, -1, -1], max: [1, 1, 1] }, gravity: [0, 0, 0], maxBodies: 2 });
  dem.addBody({ position: [-grainRadius * 1.0001, 0, 0], velocity: [speed, 0, 0], material: 0, radius: grainRadius });
  dem.addBody({ position: [grainRadius * 1.0001, 0, 0], velocity: [-speed, 0, 0], material: 0, radius: grainRadius });
  dem.run((20 * grainRadius) / Math.max(speed, 1e-3) / 10 + 50 * dem.dt);
  return ((dem.vx[1] ?? 0) - (dem.vx[0] ?? 0)) / (2 * speed);
}

/** Options for {@link brazilNutShaker}. */
export interface ShakerOptions {
  material?: DemMaterial;
  grainRadius?: number;
  grains?: number;
  /** Intruder radius over grain radius. Default 3. */
  sizeRatio?: number;
  /** Peak acceleration over g. 0 runs the unshaken control. Default 3. */
  acceleration?: number;
  frequency?: number;
  seconds?: number;
  /** Box half-width in grain radii. Default 10. */
  halfWidth?: number;
  seed?: string;
}

/** Intruder height over time in a vertically shaken bed. */
export interface ShakerResult {
  times: number[];
  /** Intruder centre height above the box floor, in grain diameters. */
  intruderHeight: number[];
  /** Bed surface height (95th percentile of grain tops), in grain diameters. */
  bedHeight: number;
}

/**
 * A large intruder buried at the floor of a vertically vibrated box of small grains (Rosato, Strandburg, Prinz &
 * Swendsen 1987; Knight, Jaeger & Nagel 1993): it rises when the peak acceleration exceeds gravity.
 * @capability granular-dem discrete element reference for sand, gravel and powders with Hertz–Mindlin contacts, rolling resistance and capillary cohesion
 */
export function brazilNutShaker(options: ShakerOptions = {}): ShakerResult {
  const r = options.grainRadius ?? 0.005;
  const count = options.grains ?? 700;
  const ratio = options.sizeRatio ?? 3;
  const half = (options.halfWidth ?? 10) * r;
  const material = options.material ?? DEM_SAND;
  const rng = seededRng(options.seed ?? "shaker");
  const walls: DemWallShape[] = [
    { kind: "plane", point: [0, 0, 0], normal: [0, 1, 0], material: 1 },
    { kind: "plane", point: [-half, 0, 0], normal: [1, 0, 0], material: 1 },
    { kind: "plane", point: [half, 0, 0], normal: [-1, 0, 0], material: 1 },
    { kind: "plane", point: [0, 0, -half], normal: [0, 0, 1], material: 1 },
    { kind: "plane", point: [0, 0, half], normal: [0, 0, -1], material: 1 },
  ];
  const interactions: DemInteraction[] = [{ a: 0, b: 1, friction: 0.5, rollingFriction: material.rollingFriction }];
  const dem = createDiscreteElements({ materials: [material, DEM_STEEL], interactions, walls, domain: { min: [-half - r, -4 * r, -half - r], max: [half + r, 400 * r, half + r] }, maxBodies: count + 1 });
  const intruder = dem.addBody({ position: [0, ratio * r + 0.0001, 0], material: 0, radius: ratio * r });
  lattice(dem, { center: [0, 0, 0], radius: half, bottom: 2 * ratio * r, count, grainRadius: r, spread: 0.1, material: 0, rng, halfWidth: half });
  settleGrains(dem, 0.01, 1);
  const frequency = options.frequency ?? 15;
  const omega = 2 * Math.PI * frequency;
  const amplitude = ((options.acceleration ?? 3) * 9.81) / (omega * omega);
  for (let w = 0; w < walls.length; w += 1) dem.setWallMotion(w, { amplitude: [0, amplitude, 0], frequency });
  const seconds = options.seconds ?? 2;
  const times: number[] = [];
  const intruderHeight: number[] = [];
  const sample = 1 / frequency;
  for (let t = 0; t < seconds - 1e-9; t += sample) {
    dem.run(sample);
    times.push(t + sample);
    intruderHeight.push(((dem.py[intruder] ?? 0) - (dem.wallOffset(0)[1] ?? 0)) / (2 * r));
  }
  const tops: number[] = [];
  for (let b = 0; b < dem.bodyCount; b += 1) if (b !== intruder) tops.push((dem.py[b] ?? 0) + (dem.sphereRadius[b] ?? 0) - (dem.wallOffset(0)[1] ?? 0));
  tops.sort((a, b) => a - b);
  return { times, intruderHeight, bedHeight: (tops[Math.floor(tops.length * 0.95)] ?? 0) / (2 * r) };
}
