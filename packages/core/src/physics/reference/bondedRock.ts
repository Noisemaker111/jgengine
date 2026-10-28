// @skill jgengine-world
/**
 * Rock as bonded grains, the bonded-particle model of Potyondy & Cundall (2004): spheres cemented by
 * parallel bonds ({@link DemBondSpec}) that break in tension or shear, so cracks grow and join into
 * fragments. The bond modulus and strength are calibrated to a rock's Young's modulus and Brazilian
 * tensile strength; impact breakage is then a prediction to check against the comminution laws in
 * `fracture/fragmentSize.ts`.
 *
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */

import { KWH_PER_TONNE, type FragmentSizes } from "../../fracture/fragmentSize";
import { seededRng, type SeededRng } from "../../random/rng";
import type { Vec3 } from "../../world/geometry";
import { createDiscreteElements, type DemBondSpec, type DemMaterial, type DemWallShape, type DiscreteElements } from "./discreteElements";

/** Measured properties of an intact rock. Representative laboratory values; each rock varies by quarry and test. */
export interface RockProperties {
  id: string;
  /** Bulk density, kg/m³. */
  density: number;
  /** Static Young's modulus, Pa. */
  youngsModulus: number;
  poissonRatio: number;
  /** Brazilian (indirect) tensile strength, Pa. */
  tensileStrength: number;
  /** Uniaxial compressive strength, Pa. */
  compressiveStrength: number;
  /** Mode I fracture toughness K_IC, Pa √m. */
  fractureToughness: number;
}

/**
 * Westerly granite (Rhode Island): ρ 2650 kg/m³, E 50 GPa, σ_t 10 MPa (reported 8–14), UCS 230 MPa (Goodman 1989;
 * Brace 1964), K_IC 1.7 MPa√m (Atkinson & Meredith 1987).
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export const WESTERLY_GRANITE: RockProperties = { id: "westerly-granite", density: 2650, youngsModulus: 50e9, poissonRatio: 0.25, tensileStrength: 10e6, compressiveStrength: 230e6, fractureToughness: 1.7e6 };

/**
 * Berea sandstone (Ohio): ρ 2100 kg/m³, E 14 GPa (reported 10–19), σ_t 2 MPa (1–3), UCS 60 MPa (50–75), K_IC 0.35 MPa√m (0.25–0.45)
 * (Goodman 1989; Atkinson & Meredith 1987).
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export const BEREA_SANDSTONE: RockProperties = { id: "berea-sandstone", density: 2100, youngsModulus: 14e9, poissonRatio: 0.2, tensileStrength: 2e6, compressiveStrength: 60e6, fractureToughness: 0.35e6 };

/**
 * Indiana (Salem) limestone: ρ 2300 kg/m³, E 28 GPa (reported 25–33), σ_t 5.9 MPa (4–7), UCS 53 MPa, K_IC 0.95 MPa√m (0.9–1.0)
 * (Goodman 1989; Atkinson & Meredith 1987).
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export const INDIANA_LIMESTONE: RockProperties = { id: "indiana-limestone", density: 2300, youngsModulus: 28e9, poissonRatio: 0.27, tensileStrength: 5.9e6, compressiveStrength: 53e6, fractureToughness: 0.95e6 };

/**
 * Basalt: ρ 2900 kg/m³, E 70 GPa (reported 50–90), σ_t 14 MPa (Nevada Test Site basalt 13.1), UCS 150–350 MPa, K_IC 2.0 MPa√m
 * (1.6–2.6) (Goodman 1989; Atkinson & Meredith 1987).
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export const BASALT: RockProperties = { id: "basalt", density: 2900, youngsModulus: 70e9, poissonRatio: 0.25, tensileStrength: 14e6, compressiveStrength: 250e6, fractureToughness: 2.0e6 };

/**
 * The four rocks with measured properties.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export const ROCKS: readonly RockProperties[] = [WESTERLY_GRANITE, BEREA_SANDSTONE, INDIANA_LIMESTONE, BASALT];

/** Micro-parameters of a bonded-particle rock. */
export interface BondedRockModel {
  rock: RockProperties;
  /** Bond Young's modulus Ē, Pa; grain contacts use the same modulus (E_c = Ē). */
  bondModulus: number;
  /** Mean bond tensile strength σ̄_c, Pa; shear strength τ̄_c is `shearRatio` times it. */
  bondStrength: number;
  /** Coefficient of variation of bond strength. Default 0.25 (Potyondy & Cundall 2004 used 0.23). */
  strengthSpread?: number;
  /** τ̄_c / σ̄_c. Default 1. */
  shearRatio?: number;
  /** k̄_n / k̄_s. Default 2.5. */
  stiffnessRatio?: number;
  /** Grain friction. Default 0.5. */
  friction?: number;
  /** Bond damping ratio. Default 0.05. */
  damping?: number;
}

/** A packed specimen: grain centres and radii, and the pairs to bond. */
export interface GrainPacking {
  centres: [number, number, number][];
  radii: number[];
  bonds: [number, number][];
  /** Grain density that gives the specimen the rock's bulk density, kg/m³. */
  grainDensity: number;
  /** Specimen volume, m³. */
  volume: number;
}

/** Shape of a specimen centred at the origin. */
export type SpecimenShape =
  | { kind: "sphere"; diameter: number }
  /** A disc or cylinder, axis along `axis`. */
  | { kind: "cylinder"; diameter: number; length: number; axis: "y" | "z" };

/**
 * Pack a specimen: a face-centred cubic lattice of `grainsAcross` grains per diameter, each point jittered by up to `jitter`
 * of the spacing, radii grown until grains touch their nearest neighbour (sizes vary about 1.6 to 1), and bonds between
 * every pair closer than 1.2 spacings. `flattenY` grinds the top and bottom flat, as a lab specimen's loaded faces are:
 * grains near them move until they touch the plane, shrinking where that would overlap a neighbour.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function packSpecimen(shape: SpecimenShape, options: { grainsAcross: number; density: number; seed: string; jitter?: number; flattenY?: boolean }): GrainPacking {
  const { grainsAcross, density } = options;
  const jitter = options.jitter ?? 0.1;
  const rng = seededRng(options.seed);
  const spacing = shape.diameter / grainsAcross;
  const cell = spacing * Math.SQRT2;
  const radius = shape.diameter / 2;
  const half: Vec3 = shape.kind === "sphere" ? [radius, radius, radius] : shape.axis === "y" ? [radius, shape.length / 2, radius] : [radius, radius, shape.length / 2];
  const inside = (x: number, y: number, z: number): boolean => {
    const margin = spacing / 2;
    if (shape.kind === "sphere") return x * x + y * y + z * z <= (radius - margin) ** 2;
    const along = shape.axis === "y" ? y : z;
    const across = shape.axis === "y" ? x * x + z * z : x * x + y * y;
    return across <= (radius - margin) ** 2 && Math.abs(along) <= shape.length / 2 - margin;
  };
  const basis: Vec3[] = [
    [0, 0, 0],
    [0, 0.5, 0.5],
    [0.5, 0, 0.5],
    [0.5, 0.5, 0],
  ];
  const centres: [number, number, number][] = [];
  const nx = Math.ceil(half[0] / cell) + 1;
  const ny = Math.ceil(half[1] / cell) + 1;
  const nz = Math.ceil(half[2] / cell) + 1;
  for (let i = -nx; i <= nx; i += 1) {
    for (let j = -ny; j <= ny; j += 1) {
      for (let k = -nz; k <= nz; k += 1) {
        for (const b of basis) {
          const x = (i + b[0]) * cell;
          const y = (j + b[1]) * cell;
          const z = (k + b[2]) * cell;
          if (!inside(x, y, z)) continue;
          centres.push([x + (rng() * 2 - 1) * jitter * spacing, y + (rng() * 2 - 1) * jitter * spacing, z + (rng() * 2 - 1) * jitter * spacing]);
        }
      }
    }
  }
  let neighbours = nearPairs(centres, 1.5 * spacing);
  const radii = new Array<number>(centres.length).fill(Infinity);
  for (const [a, b, d] of neighbours) {
    radii[a] = Math.min(radii[a] ?? Infinity, d / 2);
    radii[b] = Math.min(radii[b] ?? Infinity, d / 2);
  }
  // Grow each grain into the room its neighbours leave, in order, so none overlap.
  const around: [number, number][][] = centres.map(() => []);
  for (const [a, b, d] of neighbours) {
    around[a]?.push([b, d]);
    around[b]?.push([a, d]);
  }
  for (const [i, list] of around.entries()) {
    let room = Infinity;
    for (const [j, d] of list) room = Math.min(room, d - (radii[j] ?? 0));
    if (Number.isFinite(room)) radii[i] = room;
  }
  if (options.flattenY === true) {
    let top = -Infinity;
    let bottom = Infinity;
    for (const [i, c] of centres.entries()) {
      top = Math.max(top, c[1] + (radii[i] ?? 0));
      bottom = Math.min(bottom, c[1] - (radii[i] ?? 0));
    }
    const reach = 0.5 * spacing;
    for (let pass = 0; pass < 4; pass += 1) {
      const moved = new Uint8Array(centres.length);
      for (const [i, c] of centres.entries()) {
        const r = radii[i] ?? 0;
        if (c[1] + r > top - reach) {
          c[1] = top - r;
          moved[i] = 1;
        } else if (c[1] - r < bottom + reach) {
          c[1] = bottom + r;
          moved[i] = 1;
        }
      }
      neighbours = nearPairs(centres, 1.5 * spacing);
      for (const [a, b, d] of neighbours) {
        const overlap = (radii[a] ?? 0) + (radii[b] ?? 0) - d;
        if (overlap <= 0) continue;
        if (moved[a] === 1) radii[a] = (radii[a] ?? 0) - overlap;
        else radii[b] = (radii[b] ?? 0) - overlap;
      }
    }
  }
  const bonds: [number, number][] = [];
  for (const [a, b, d] of neighbours) if (d < 1.2 * spacing) bonds.push([a, b]);
  const volume = shape.kind === "sphere" ? (Math.PI / 6) * shape.diameter ** 3 : (Math.PI / 4) * shape.diameter ** 2 * shape.length;
  let solid = 0;
  for (const r of radii) solid += (4 / 3) * Math.PI * r ** 3;
  return { centres, radii, bonds, grainDensity: (density * volume) / solid, volume };
}

function nearPairs(points: readonly Vec3[], reach: number): [number, number, number][] {
  const grid = new Map<string, number[]>();
  const key = (p: Vec3): [number, number, number] => [Math.floor(p[0] / reach), Math.floor(p[1] / reach), Math.floor(p[2] / reach)];
  for (const [i, p] of points.entries()) {
    const [a, b, c] = key(p);
    const id = `${a},${b},${c}`;
    const list = grid.get(id);
    if (list === undefined) grid.set(id, [i]);
    else list.push(i);
  }
  const out: [number, number, number][] = [];
  for (const [i, p] of points.entries()) {
    const [a, b, c] = key(p);
    for (let da = -1; da <= 1; da += 1) {
      for (let db = -1; db <= 1; db += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          for (const j of grid.get(`${a + da},${b + db},${c + dc}`) ?? []) {
            if (j <= i) continue;
            const q = points[j];
            if (q === undefined) continue;
            const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
            if (d < reach) out.push([i, j, d]);
          }
        }
      }
    }
  }
  return out;
}

function gaussian(rng: SeededRng): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Steel platens and anvils: E 200 GPa. */
const STEEL: DemMaterial = { id: "steel", density: 7800, youngsModulus: 200e9, poissonRatio: 0.3, restitution: 0.5, friction: 0.3, rollingFriction: 0 };

/** A bonded specimen ready to load. */
export interface BondedSpecimen {
  dem: DiscreteElements;
  packing: GrainPacking;
  /** Specimen mass, kg. */
  mass: number;
}

/**
 * Build a bonded specimen in a DEM system with steel walls, material 1. Bond strengths are drawn per bond from a normal
 * distribution (truncated at a fifth of the mean); `strength` Infinity makes unbreakable bonds.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function bondedSpecimen(model: BondedRockModel, packing: GrainPacking, options: { walls?: readonly DemWallShape[]; offset?: Vec3; velocity?: Vec3; seed?: string; gravity?: Vec3; domain?: number } = {}): BondedSpecimen {
  const rock = model.rock;
  const grain: DemMaterial = { id: rock.id, density: packing.grainDensity, youngsModulus: model.bondModulus, poissonRatio: rock.poissonRatio, restitution: 0.5, friction: model.friction ?? 0.5, rollingFriction: 0 };
  const reach = options.domain ?? 1;
  const dem = createDiscreteElements({
    materials: [grain, STEEL],
    walls: options.walls ?? [],
    domain: { min: [-reach, -reach, -reach], max: [reach, reach, reach] },
    gravity: options.gravity ?? [0, 0, 0],
    maxBodies: packing.centres.length,
    maxBonds: packing.bonds.length,
  });
  const offset = options.offset ?? [0, 0, 0];
  const velocity = options.velocity ?? [0, 0, 0];
  let mass = 0;
  for (const [i, c] of packing.centres.entries()) {
    const b = dem.addBody({ position: [c[0] + offset[0], c[1] + offset[1], c[2] + offset[2]], radius: packing.radii[i] ?? 0, material: 0, velocity });
    mass += dem.mass[b] ?? 0;
  }
  const rng = seededRng(options.seed ?? "bonds");
  const spread = model.strengthSpread ?? 0.25;
  const shearRatio = model.shearRatio ?? 1;
  for (const [a, b] of packing.bonds) {
    const scale = Number.isFinite(model.bondStrength) ? Math.max(0.2, 1 + spread * gaussian(rng)) : 1;
    const strength = model.bondStrength * scale;
    const spec: DemBondSpec = { modulus: model.bondModulus, tensileStrength: strength, shearStrength: strength * shearRatio, stiffnessRatio: model.stiffnessRatio ?? 2.5, damping: model.damping ?? 0.05 };
    dem.bond(a, b, spec);
  }
  return { dem, packing, mass };
}

/**
 * Fragments of a bonded specimen: grains joined by intact bonds, by union–find. Each fragment's size is its equivalent
 * diameter scaled so the intact specimen measures `parentSize`: x = D (m/M)^(1/3).
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function bondedFragments(dem: DiscreteElements, parentSize: number): FragmentSizes & { grains: number[] } {
  const parent = new Int32Array(dem.bodyCount);
  for (let i = 0; i < parent.length; i += 1) parent[i] = i;
  const find = (i: number): number => {
    let r = i;
    while ((parent[r] ?? r) !== r) r = parent[r] ?? r;
    let c = i;
    while (c !== r) {
      const next = parent[c] ?? r;
      parent[c] = r;
      c = next;
    }
    return r;
  };
  for (let k = 0; k < dem.bondCount; k += 1) {
    if (dem.bondIntact[k] !== 1) continue;
    const a = find(dem.bondEnds[k * 2] ?? 0);
    const b = find(dem.bondEnds[k * 2 + 1] ?? 0);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  }
  const massOf = new Map<number, number>();
  const countOf = new Map<number, number>();
  let total = 0;
  for (let b = 0; b < dem.bodyCount; b += 1) {
    const root = find(b);
    const m = dem.mass[b] ?? 0;
    total += m;
    massOf.set(root, (massOf.get(root) ?? 0) + m);
    countOf.set(root, (countOf.get(root) ?? 0) + 1);
  }
  const sizes: number[] = [];
  const masses: number[] = [];
  const grains: number[] = [];
  for (const [root, m] of massOf) {
    sizes.push(parentSize * Math.cbrt(m / total));
    masses.push(m);
    grains.push(countOf.get(root) ?? 0);
  }
  return { sizes, masses, grains };
}

/** P-wave speed √(E/ρ) of a rock, m/s. */
function waveSpeed(rock: RockProperties): number {
  return Math.sqrt(rock.youngsModulus / rock.density);
}

/** Options shared by the specimen tests. */
export interface SpecimenTestOptions {
  /** Grains across the specimen diameter. */
  grainsAcross?: number;
  /** Specimen diameter, m. Default 0.05. */
  diameter?: number;
  seed?: string;
}

/** Result of {@link uniaxialModulus}. */
export interface ModulusResult {
  /** Young's modulus from the axial stress–strain slope, Pa. */
  modulus: number;
  grains: number;
  /** Gauge strain and axial stress, Pa, at the end of loading. */
  finalStrain: number;
  finalStress: number;
}

/**
 * Young's modulus of a bonded cylinder (height twice its diameter) squeezed slowly between steel platens with unbreakable
 * bonds: the secant slope of axial stress against platen strain between 40% and 100% of 10⁻⁴ strain.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function uniaxialModulus(model: BondedRockModel, options: SpecimenTestOptions = {}): ModulusResult {
  const diameter = options.diameter ?? 0.05;
  const across = options.grainsAcross ?? 10;
  const length = 2 * diameter;
  const packing = packSpecimen({ kind: "cylinder", diameter, length, axis: "y" }, { grainsAcross: across, density: model.rock.density, seed: options.seed ?? "modulus", flattenY: true });
  let top = -Infinity;
  let bottom = Infinity;
  for (const [i, c] of packing.centres.entries()) {
    top = Math.max(top, c[1] + (packing.radii[i] ?? 0));
    bottom = Math.min(bottom, c[1] - (packing.radii[i] ?? 0));
  }
  const walls: DemWallShape[] = [
    { kind: "plane", point: [0, top, 0], normal: [0, -1, 0], material: 1 },
    { kind: "plane", point: [0, bottom, 0], normal: [0, 1, 0], material: 1 },
  ];
  const specimen = bondedSpecimen({ ...model, bondStrength: Infinity }, packing, { walls, seed: options.seed ?? "modulus" });
  const { dem } = specimen;
  const height = top - bottom;
  const target = 1e-4;
  // Quasi-static: the platens close the target strain over about 30 P-wave transits of the specimen.
  const duration = (30 * height) / waveSpeed(model.rock);
  const speed = (target * height) / 2 / duration;
  dem.setWallMotion(0, { velocity: [0, -speed, 0] });
  dem.setWallMotion(1, { velocity: [0, speed, 0] });
  const area = (Math.PI / 4) * diameter * diameter;
  // Strain from two gauge bands of grains a quarter length from each end, clear of the platen seating.
  const upper: number[] = [];
  const lower: number[] = [];
  for (const [i, c] of packing.centres.entries()) {
    if (c[1] > length / 4 - length / 16 && c[1] < length / 4 + length / 16) upper.push(i);
    if (c[1] < -length / 4 + length / 16 && c[1] > -length / 4 - length / 16) lower.push(i);
  }
  const bandY = (band: readonly number[]): number => {
    let sum = 0;
    for (const i of band) sum += dem.py[i] ?? 0;
    return sum / Math.max(1, band.length);
  };
  const gauge = bandY(upper) - bandY(lower);
  const sample = (): { strain: number; stress: number } => {
    const load = ((dem.wallNormalForce[0] ?? 0) + (dem.wallNormalForce[1] ?? 0)) / 2;
    return { strain: (gauge - (bandY(upper) - bandY(lower))) / gauge, stress: load / area };
  };
  const strains: number[] = [];
  const stresses: number[] = [];
  while (dem.wallOffset(1)[1] - dem.wallOffset(0)[1] < target * height) {
    dem.step();
    const now = sample();
    strains.push(now.strain);
    stresses.push(now.stress);
  }
  // Least-squares slope over the loading above 30% of the final stress, past the seating.
  const final = stresses[stresses.length - 1] ?? 0;
  let n = 0;
  let mx = 0;
  let my = 0;
  for (const [i, s] of stresses.entries()) {
    if (s < 0.3 * final) continue;
    n += 1;
    mx += strains[i] ?? 0;
    my += s;
  }
  mx /= Math.max(1, n);
  my /= Math.max(1, n);
  let sxy = 0;
  let sxx = 0;
  for (const [i, s] of stresses.entries()) {
    if (s < 0.3 * final) continue;
    const dx = (strains[i] ?? 0) - mx;
    sxy += dx * (s - my);
    sxx += dx * dx;
  }
  return { modulus: sxx > 0 ? sxy / sxx : 0, grains: packing.centres.length, finalStrain: strains[strains.length - 1] ?? 0, finalStress: final };
}

/** Result of {@link brazilianTest}. */
export interface BrazilianResult {
  /** Peak platen load, N. */
  peakLoad: number;
  /** Indirect tensile strength 2P/(π D t), Pa. */
  tensileStrength: number;
  /** Bonds broken by the end. */
  broken: number;
  grains: number;
}

/**
 * Brazilian disc test (ISRM 1978): a disc of thickness half its diameter squeezed across a diameter between steel platens
 * until the load falls to half its peak or stops rising for 30 P-wave transits; σ_t = 2P/(π D t).
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function brazilianTest(model: BondedRockModel, options: SpecimenTestOptions & { rateScale?: number } = {}): BrazilianResult {
  const diameter = options.diameter ?? 0.05;
  const across = options.grainsAcross ?? 20;
  const thickness = diameter / 2;
  const packing = packSpecimen({ kind: "cylinder", diameter, length: thickness, axis: "z" }, { grainsAcross: across, density: model.rock.density, seed: options.seed ?? "brazil", flattenY: true });
  let top = -Infinity;
  let bottom = Infinity;
  for (const [i, c] of packing.centres.entries()) {
    top = Math.max(top, c[1] + (packing.radii[i] ?? 0));
    bottom = Math.min(bottom, c[1] - (packing.radii[i] ?? 0));
  }
  const walls: DemWallShape[] = [
    { kind: "plane", point: [0, top, 0], normal: [0, -1, 0], material: 1 },
    { kind: "plane", point: [0, bottom, 0], normal: [0, 1, 0], material: 1 },
  ];
  const { dem } = bondedSpecimen(model, packing, { walls, seed: options.seed ?? "brazil" });
  const rock = model.rock;
  // Close at a rate that reaches failure over about 40 P-wave transits; the platens close about 12 σ_t/E of the diameter by then.
  const failure = ((options.rateScale ?? 1) * 12 * rock.tensileStrength) / rock.youngsModulus;
  const transit = diameter / waveSpeed(rock);
  const speed = (failure * diameter) / 2 / (40 * transit);
  dem.setWallMotion(0, { velocity: [0, -speed, 0] });
  dem.setWallMotion(1, { velocity: [0, speed, 0] });
  let peak = 0;
  let peakStep = 0;
  let broken = 0;
  const limit = Math.ceil((400 * transit) / dem.dt);
  const settle = Math.ceil((30 * transit) / dem.dt);
  for (let i = 0; i < limit; i += 1) {
    broken += dem.step().bondsBroken;
    const load = ((dem.wallNormalForce[0] ?? 0) + (dem.wallNormalForce[1] ?? 0)) / 2;
    if (load > peak) {
      peak = load;
      peakStep = i;
    } else if (broken > 0 && (load < 0.5 * peak || i - peakStep > settle)) break;
  }
  return { peakLoad: peak, tensileStrength: (2 * peak) / (Math.PI * diameter * thickness), broken, grains: packing.centres.length };
}

/** Result of {@link calibrateBondedRock}. */
export interface CalibrationResult {
  model: BondedRockModel;
  /** Modulus and strength the calibrated model measures, Pa. */
  modulus: number;
  tensileStrength: number;
}

/**
 * Calibrate bond modulus to the rock's Young's modulus and bond strength to its Brazilian strength. The model is linear in
 * both (Potyondy & Cundall 2004), so each is one rescale and a check.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function calibrateBondedRock(rock: RockProperties, options: SpecimenTestOptions & { modulusGrainsAcross?: number } = {}): CalibrationResult {
  let model: BondedRockModel = { rock, bondModulus: rock.youngsModulus, bondStrength: 10 * rock.tensileStrength };
  const modulusOptions: SpecimenTestOptions = { ...options, grainsAcross: options.modulusGrainsAcross ?? 10 };
  const first = uniaxialModulus(model, modulusOptions).modulus;
  model = { ...model, bondModulus: (model.bondModulus * rock.youngsModulus) / first };
  const modulus = uniaxialModulus(model, modulusOptions).modulus;
  const trial = brazilianTest(model, options).tensileStrength;
  model = { ...model, bondStrength: (model.bondStrength * rock.tensileStrength) / trial };
  const tensileStrength = brazilianTest(model, options).tensileStrength;
  return { model, modulus, tensileStrength };
}

/** Options of {@link impactBreakage}. */
export interface ImpactOptions extends SpecimenTestOptions {
  /** Specific impact energy, kWh/t: the specimen hits the anvil at √(2 E). */
  energy: number;
}

/** Result of {@link impactBreakage}. */
export interface ImpactResult {
  energy: number;
  speed: number;
  fragments: FragmentSizes & { grains: number[] };
  /** Largest fragment over specimen mass. */
  largest: number;
  /** Fragment count of more than one grain. */
  pieces: number;
  broken: number;
  bonds: number;
  grains: number;
}

/**
 * Single-impact breakage: a bonded sphere fired at a steel anvil at the speed that carries `energy` kWh/t, run until no
 * bond has broken for 20 P-wave transits and the specimen is rebounding.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function impactBreakage(model: BondedRockModel, options: ImpactOptions): ImpactResult {
  const diameter = options.diameter ?? 0.05;
  const across = options.grainsAcross ?? 14;
  const packing = packSpecimen({ kind: "sphere", diameter }, { grainsAcross: across, density: model.rock.density, seed: options.seed ?? "impact" });
  const speed = Math.sqrt(2 * options.energy * KWH_PER_TONNE);
  let lowest = Infinity;
  for (const [i, c] of packing.centres.entries()) lowest = Math.min(lowest, c[1] - (packing.radii[i] ?? 0));
  const walls: DemWallShape[] = [{ kind: "plane", point: [0, lowest - 1e-4 * diameter, 0], normal: [0, 1, 0], material: 1 }];
  const { dem } = bondedSpecimen(model, packing, { walls, velocity: [0, -speed, 0], seed: options.seed ?? "impact", domain: 20 * diameter });
  const transit = diameter / waveSpeed(model.rock);
  const chunk = Math.max(1, Math.round(transit / dem.dt));
  let quiet = 0;
  let broken = 0;
  const limit = 400;
  for (let t = 0; t < limit; t += 1) {
    let now = 0;
    for (let i = 0; i < chunk; i += 1) now += dem.step().bondsBroken;
    broken += now;
    quiet = now === 0 ? quiet + 1 : 0;
    let momentum = 0;
    for (let b = 0; b < dem.bodyCount; b += 1) momentum += (dem.mass[b] ?? 0) * (dem.vy[b] ?? 0);
    if (quiet >= 20 && momentum > 0) break;
  }
  const fragments = bondedFragments(dem, diameter);
  let total = 0;
  let largest = 0;
  let pieces = 0;
  for (const [i, m] of fragments.masses.entries()) {
    total += m;
    largest = Math.max(largest, m);
    if ((fragments.grains[i] ?? 0) > 1) pieces += 1;
  }
  return { energy: options.energy, speed, fragments, largest: largest / total, pieces, broken, bonds: dem.bondCount, grains: packing.centres.length };
}
