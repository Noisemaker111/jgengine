// @skill jgengine-world
/**
 * A discrete element (DEM) reference for granular matter: rigid spheres and sphere clumps that touch
 * through Hertz–Mindlin contacts. Normal force is Hertz, F = 4/3 E* √R* δ^{3/2}; tangential is the
 * Mindlin no-slip spring S_t = 8 G* √(R* δ) capped by Coulomb friction; both are damped with the
 * restitution-matched coefficient of Tsuji, Tanaka & Ishida (1992) in the form of Antypov & Elliott
 * (2011). Rolling resistance is the elastic–plastic spring–dashpot model of Ai, Chen, Rotter & Ooi
 * (2011). Damp grains attract through pendular liquid bridges: the force of Willett, Adams, Johnson &
 * Seville (2000) for a bridge of given volume, which ruptures at the separation of Lian, Thornton &
 * Adams (1993). Grains can be cemented by the parallel bonds of Potyondy & Cundall (2004), which carry
 * force and moment and break in tension or shear, so a bonded assembly fractures like rock.
 *
 * Contacts are found through Verlet neighbour lists rebuilt from a uniform grid whenever a grain has
 * moved half the skin, and each list entry carries its pair's spring history. Pairs are always
 * visited in (lower index, higher index) order, so forces sum in a fixed order and a snapshot replays
 * bit-identically. Body, sphere and grid sizes are bounded at creation; a step costs O(contacts).
 *
 * @capability granular-dem discrete element reference for sand, gravel and powders with Hertz–Mindlin contacts, rolling resistance and capillary cohesion
 */
import type { Vec3 } from "@jgengine/core/world/geometry";

/** A grain material. Simulation stiffness may be far below the solid's (see {@link DemMaterial.youngsModulus}). */
export interface DemMaterial {
  id: string;
  /** Solid density, kg/m³. */
  density: number;
  /**
   * Young's modulus used for contacts, Pa. Quasi-static packing, repose and discharge are insensitive to it once
   * overlaps stay a few percent of a radius, so DEM practice lowers it to lengthen the stable time step.
   */
  youngsModulus: number;
  poissonRatio: number;
  /** Normal coefficient of restitution, 0..1. */
  restitution: number;
  /** Coulomb sliding friction coefficient. */
  friction: number;
  /** Rolling resistance coefficient of the Ai et al. (2011) model, dimensionless. */
  rollingFriction: number;
}

/** Pendular liquid bridges between damp grains. */
export interface DemLiquid {
  /** Liquid–air surface tension, N/m (water 0.072). */
  surfaceTension: number;
  /** Solid–liquid contact angle, rad. */
  contactAngle: number;
  /** Volume of one bridge, m³ (see {@link bridgeVolumeFromMoisture}). */
  bridgeVolume: number;
}

/** How a wall moves: steady velocity plus a sinusoidal shake, both from the moment the motion is set. */
export interface DemWallMotion {
  velocity?: Vec3;
  amplitude?: Vec3;
  /** Shake frequency, Hz. */
  frequency?: number;
}

/** A frictional boundary. Walls take the material at index `material`. */
export type DemWallShape =
  /** Infinite plane; grains stay on the side `normal` points to. */
  | { kind: "plane"; point: Vec3; normal: Vec3; material: number }
  /** Thin annulus in the plane through `center` normal to `normal`: a floor with a round orifice (`innerRadius` > 0). Two-sided. */
  | { kind: "disc"; center: Vec3; normal: Vec3; innerRadius: number; outerRadius: number; material: number }
  /** Inside of a cylinder of `radius` from `center` along unit `axis` for `length`. */
  | { kind: "cylinder"; center: Vec3; axis: Vec3; radius: number; length: number; material: number };

/** One sphere of a body, in the body's frame. */
export interface DemSphereSpec {
  offset: Vec3;
  radius: number;
}

/** A body to add: one sphere (`radius`) or a rigid clump (`spheres`). */
export interface DemBodySpec {
  position: Vec3;
  velocity?: Vec3;
  angularVelocity?: Vec3;
  material: number;
  radius?: number;
  spheres?: readonly DemSphereSpec[];
  /** Overrides density × Σ sphere volume (a clump's spheres may overlap). */
  mass?: number;
  /** Held in place: a grain glued to a rough floor or wall. It still touches others, with infinite mass. */
  fixed?: boolean;
}

/**
 * Contact coefficients for one pair of materials (a grain on a wall, say). Unset pairs take the lower friction
 * and rolling coefficients of the two and the mean restitution.
 */
export interface DemInteraction {
  a: number;
  b: number;
  friction?: number;
  rollingFriction?: number;
  restitution?: number;
}

/** Configuration of {@link createDiscreteElements}. */
export interface DiscreteElementConfig {
  materials: readonly DemMaterial[];
  interactions?: readonly DemInteraction[];
  walls?: readonly DemWallShape[];
  /** Grains leaving this box are deactivated and reported by {@link DiscreteElements.step}. */
  domain: { min: Vec3; max: Vec3 };
  gravity?: Vec3;
  liquid?: DemLiquid;
  /** Time step, s; default 0.2 × the Rayleigh time of the smallest grain, or 0.2 √(m / (k̄n A)) of the stiffest bond, added before the first step. */
  dt?: number;
  maxBodies: number;
  /** Default `maxBodies` (one sphere each). */
  maxSpheres?: number;
  /** Parallel bonds the system can hold. Default 0. */
  maxBonds?: number;
}

/**
 * A parallel bond (Potyondy & Cundall 2004): a disc of elastic cement between two single-sphere grains
 * that carries force and moment, and breaks for good once the tensile stress σ = −F_n/A + |M_s| R̄/I or
 * the shear stress τ = |F_s|/A + |M_n| R̄/J reaches its strength.
 */
export interface DemBondSpec {
  /** Bond radius over the smaller grain radius, λ̄. Default 1. */
  radiusMultiplier?: number;
  /** Bond Young's modulus Ē, Pa: normal stiffness per area k̄_n = Ē / (r_a + r_b). */
  modulus: number;
  /** k̄_n / k̄_s. Default 2.5. */
  stiffnessRatio?: number;
  /** Tensile strength σ̄_c, Pa. */
  tensileStrength: number;
  /** Shear strength τ̄_c, Pa. */
  shearStrength: number;
  /** Fraction of critical damping on the bond's relative motion. Default 0.05. */
  damping?: number;
}

/** What one step did. */
export interface DemStepReport {
  /** Body indices deactivated this step because they left the domain. */
  exited: readonly number[];
  contacts: number;
  /** Largest overlap this step as a fraction of the smaller radius. */
  maxOverlap: number;
  /** Bonds that broke this step. */
  bondsBroken: number;
}

/** What a parallel bond carries now. Tension and tensile stress are positive pulling apart. */
export interface DemBondLoad {
  tension: number;
  shear: number;
  twist: number;
  bend: number;
  tensileStress: number;
  shearStress: number;
}

/** A serializable state of a {@link DiscreteElements} system. */
export interface DemSnapshot {
  time: number;
  dt: number;
  bodyCount: number;
  sphereCount: number;
  /** Per body: px py pz vx vy vz qw qx qy qz Lx Ly Lz mass active material fixed. */
  bodies: number[];
  /** Per body: inverse inertia xx yy zz xy xz yz in the body frame. */
  inertia: number[];
  /** Per sphere: body ox oy oz radius. */
  spheres: number[];
  /** Per pair with history: i j ξx ξy ξz Mx My Mz wet. */
  contacts: number[];
  /** Per sphere–wall contact: sphere wall ξx ξy ξz Mx My Mz. */
  wallContacts: number[];
  walls: DemWallShape[];
  /** Per wall: offset xyz, velocity xyz, amplitude xyz, frequency, motion start; then per wall the base offset xyz. */
  wallState: number[];
  /** Per bond: a b intact radius k̄n k̄s σ̄c τ̄c damping Fn Fsx Fsy Fsz Mn Msx Msy Msz. */
  bonds: number[];
}

/** A running DEM system. Arrays are live views for measurement; mutate state only through methods. */
export interface DiscreteElements {
  readonly materials: readonly DemMaterial[];
  readonly bodyCount: number;
  readonly sphereCount: number;
  readonly time: number;
  readonly dt: number;
  readonly px: Float64Array;
  readonly py: Float64Array;
  readonly pz: Float64Array;
  readonly vx: Float64Array;
  readonly vy: Float64Array;
  readonly vz: Float64Array;
  readonly mass: Float64Array;
  /** 1 while a body is simulated. */
  readonly active: Uint8Array;
  /** 1 for a body held in place. */
  readonly fixed: Uint8Array;
  /** Body owning each sphere. */
  readonly sphereBody: Int32Array;
  readonly sphereRadius: Float64Array;
  /** Sphere world centres, refreshed every step. */
  readonly sx: Float64Array;
  readonly sy: Float64Array;
  readonly sz: Float64Array;
  /** Force the grains pressed on each wall during the last step, N (xyz per wall). */
  readonly wallForce: Float64Array;
  /** Sum of contact normal force magnitudes on each wall during the last step, N; with {@link wallForce} it gives the mobilized wall friction. */
  readonly wallNormalForce: Float64Array;
  readonly bondCount: number;
  /** The two bodies of each bond. */
  readonly bondEnds: Int32Array;
  /** 1 while a bond holds. */
  readonly bondIntact: Uint8Array;
  addBody(spec: DemBodySpec): number;
  /** Cement two single-sphere bodies with a parallel bond, unloaded in their current pose. */
  bond(a: number, b: number, spec: DemBondSpec): number;
  /** Bond every pair of single-sphere bodies whose gap is at most `tolerance` of the smaller radius (default 0.05); returns the count. */
  bondTouching(spec: DemBondSpec | ((a: number, b: number) => DemBondSpec), tolerance?: number): number;
  bondLoad(bond: number): DemBondLoad;
  /** Move a body (reactivating it), zeroing its spin. */
  placeBody(body: number, position: Vec3, velocity?: Vec3): void;
  deactivate(body: number): void;
  /** Angular velocity of a body, rad/s. */
  angularVelocity(body: number): Vec3;
  /** Orientation of a body as a unit quaternion [w, x, y, z]. */
  orientation(body: number): readonly [number, number, number, number];
  setWallMotion(wall: number, motion: DemWallMotion): void;
  /** Current displacement of a wall from its authored position. */
  wallOffset(wall: number): Vec3;
  step(): DemStepReport;
  /** Advance `seconds`, collecting every exit. */
  run(seconds: number): DemStepReport;
  kineticEnergy(): number;
  snapshot(): DemSnapshot;
  restore(snapshot: DemSnapshot): void;
}

const SQRT_5_6 = Math.sqrt(5 / 6);
const ROLLING_DAMPING = 0.3;
const BODY_STRIDE = 17;
const WALL_STRIDE = 11;
const BOND_PROPS = 6;
const BOND_LOAD = 8;
/** Verlet skin as a fraction of the largest radius. */
const SKIN = 0.4;

/**
 * Damping ratio β of the restitution-matched Hertzian dashpot, ln e / √(ln² e + π²) (negative).
 * @capability granular-dem discrete element reference for sand, gravel and powders with Hertz–Mindlin contacts, rolling resistance and capillary cohesion
 */
export function restitutionDamping(restitution: number): number {
  const e = Math.min(Math.max(restitution, 1e-6), 1);
  const ln = Math.log(e);
  return ln / Math.sqrt(ln * ln + Math.PI * Math.PI);
}

/**
 * Rayleigh-wave time step of a grain, π R √(ρ/G) / (0.1631 ν + 0.8766); a DEM step is a fraction of it.
 * @capability granular-dem discrete element reference for sand, gravel and powders with Hertz–Mindlin contacts, rolling resistance and capillary cohesion
 */
export function rayleighTime(material: DemMaterial, radius: number): number {
  const shear = material.youngsModulus / (2 * (1 + material.poissonRatio));
  return (Math.PI * radius * Math.sqrt(material.density / shear)) / (0.1631 * material.poissonRatio + 0.8766);
}

/**
 * Volume of one liquid bridge when a grain of `radius` holds `moisture` (liquid mass per solid mass) shared among
 * `coordination` bridges, each fed by both grains: 2 w (ρ_s/ρ_l) V_p / z.
 * @capability granular-dem discrete element reference for sand, gravel and powders with Hertz–Mindlin contacts, rolling resistance and capillary cohesion
 */
export function bridgeVolumeFromMoisture(moisture: number, radius: number, solidDensity: number, liquidDensity = 1000, coordination = 6): number {
  const grain = (4 / 3) * Math.PI * radius ** 3;
  return (2 * moisture * (solidDensity / liquidDensity) * grain) / coordination;
}

/**
 * Capillary force of a bridge between spheres of harmonic-mean radius `radius` at gap `separation`
 * (Willett et al. 2000): 2π R γ cos θ / (1 + 1.05 Ŝ + 2.5 Ŝ²), Ŝ = S √(R/V).
 * @capability granular-dem discrete element reference for sand, gravel and powders with Hertz–Mindlin contacts, rolling resistance and capillary cohesion
 */
export function capillaryForce(liquid: DemLiquid, radius: number, separation: number): number {
  const s = Math.max(0, separation) * Math.sqrt(radius / liquid.bridgeVolume);
  return (2 * Math.PI * radius * liquid.surfaceTension * Math.cos(liquid.contactAngle)) / (1 + 1.05 * s + 2.5 * s * s);
}

/**
 * Gap at which a bridge breaks (Lian et al. 1993): (1 + θ/2) V^{1/3}.
 * @capability granular-dem discrete element reference for sand, gravel and powders with Hertz–Mindlin contacts, rolling resistance and capillary cohesion
 */
export function bridgeRuptureDistance(liquid: DemLiquid): number {
  return (1 + liquid.contactAngle / 2) * Math.cbrt(liquid.bridgeVolume);
}

interface PairLaw {
  effectiveModulus: number;
  effectiveShear: number;
  beta: number;
  friction: number;
  rolling: number;
}

function pairLaw(a: DemMaterial, b: DemMaterial): PairLaw {
  const shearA = a.youngsModulus / (2 * (1 + a.poissonRatio));
  const shearB = b.youngsModulus / (2 * (1 + b.poissonRatio));
  return {
    effectiveModulus: 1 / ((1 - a.poissonRatio ** 2) / a.youngsModulus + (1 - b.poissonRatio ** 2) / b.youngsModulus),
    effectiveShear: 1 / ((2 - a.poissonRatio) / shearA + (2 - b.poissonRatio) / shearB),
    beta: restitutionDamping((a.restitution + b.restitution) / 2),
    friction: Math.min(a.friction, b.friction),
    rolling: Math.min(a.rollingFriction, b.rollingFriction),
  };
}

function unit(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len > 0 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 1, 0];
}

function normalizeWall(wall: DemWallShape): DemWallShape {
  if (wall.kind === "plane") return { ...wall, normal: unit(wall.normal) };
  if (wall.kind === "disc") return { ...wall, normal: unit(wall.normal) };
  return { ...wall, axis: unit(wall.axis) };
}

/** Pair list in compressed rows: sphere i's partners j > i, ascending, each with its spring history. */
interface PairList {
  start: Int32Array;
  partner: Int32Array;
  xi: Float64Array;
  moment: Float64Array;
  wet: Uint8Array;
}

function createPairList(spheres: number, capacity: number): PairList {
  return { start: new Int32Array(spheres + 1), partner: new Int32Array(capacity), xi: new Float64Array(capacity * 3), moment: new Float64Array(capacity * 3), wet: new Uint8Array(capacity) };
}

function ensurePairCapacity(list: PairList, needed: number): PairList {
  if (list.partner.length >= needed) return list;
  const capacity = Math.max(needed, list.partner.length * 2);
  return { start: list.start, partner: new Int32Array(capacity), xi: new Float64Array(capacity * 3), moment: new Float64Array(capacity * 3), wet: new Uint8Array(capacity) };
}

/**
 * Create a DEM system. Add grains with `addBody`, then `step` or `run`.
 * @capability granular-dem discrete element reference for sand, gravel and powders with Hertz–Mindlin contacts, rolling resistance and capillary cohesion
 */
export function createDiscreteElements(config: DiscreteElementConfig): DiscreteElements {
  const materials = config.materials;
  const materialCount = materials.length;
  const laws: PairLaw[] = [];
  for (let a = 0; a < materialCount; a += 1) {
    for (let b = 0; b < materialCount; b += 1) {
      const ma = materials[a];
      const mb = materials[b];
      if (ma === undefined || mb === undefined) throw new Error("discreteElements: missing material");
      const law = pairLaw(ma, mb);
      const override = config.interactions?.find((pair) => (pair.a === a && pair.b === b) || (pair.a === b && pair.b === a));
      if (override?.friction !== undefined) law.friction = override.friction;
      if (override?.rollingFriction !== undefined) law.rolling = override.rollingFriction;
      if (override?.restitution !== undefined) law.beta = restitutionDamping(override.restitution);
      laws.push(law);
    }
  }
  const lawOf = (a: number, b: number): PairLaw => {
    const law = laws[a * materialCount + b];
    if (law === undefined) throw new Error(`discreteElements: no material ${a} or ${b}`);
    return law;
  };
  const gravity: Vec3 = config.gravity ?? [0, -9.81, 0];
  const liquid = config.liquid;
  const rupture = liquid === undefined ? 0 : bridgeRuptureDistance(liquid);
  const maxBodies = config.maxBodies;
  const maxSpheres = config.maxSpheres ?? maxBodies;
  let walls: DemWallShape[] = (config.walls ?? []).map(normalizeWall);
  const wallCount = walls.length;
  const wallState = new Float64Array(wallCount * WALL_STRIDE);
  const wallBase = new Float64Array(wallCount * 3);
  const wallVel = new Float64Array(wallCount * 3);
  const wallForce = new Float64Array(wallCount * 3);
  const wallNormalForce = new Float64Array(wallCount);

  const px = new Float64Array(maxBodies);
  const py = new Float64Array(maxBodies);
  const pz = new Float64Array(maxBodies);
  const vx = new Float64Array(maxBodies);
  const vy = new Float64Array(maxBodies);
  const vz = new Float64Array(maxBodies);
  const qw = new Float64Array(maxBodies);
  const qx = new Float64Array(maxBodies);
  const qy = new Float64Array(maxBodies);
  const qz = new Float64Array(maxBodies);
  const lx = new Float64Array(maxBodies);
  const ly = new Float64Array(maxBodies);
  const lz = new Float64Array(maxBodies);
  const wx = new Float64Array(maxBodies);
  const wy = new Float64Array(maxBodies);
  const wz = new Float64Array(maxBodies);
  const fx = new Float64Array(maxBodies);
  const fy = new Float64Array(maxBodies);
  const fz = new Float64Array(maxBodies);
  const tx = new Float64Array(maxBodies);
  const ty = new Float64Array(maxBodies);
  const tz = new Float64Array(maxBodies);
  const mass = new Float64Array(maxBodies);
  const inverseInertia = new Float64Array(maxBodies * 6);
  const rollingInertia = new Float64Array(maxBodies);
  const bodyMaterial = new Int32Array(maxBodies);
  const active = new Uint8Array(maxBodies);
  const isotropic = new Uint8Array(maxBodies);
  const fixed = new Uint8Array(maxBodies);
  const firstSphere = new Int32Array(maxBodies);
  const sphereTotal = new Int32Array(maxBodies);

  const sphereBody = new Int32Array(maxSpheres);
  const sphereRadius = new Float64Array(maxSpheres);
  const ox = new Float64Array(maxSpheres);
  const oy = new Float64Array(maxSpheres);
  const oz = new Float64Array(maxSpheres);
  const sx = new Float64Array(maxSpheres);
  const sy = new Float64Array(maxSpheres);
  const sz = new Float64Array(maxSpheres);
  // Positions at the last list build, for the half-skin rebuild test.
  const bx0 = new Float64Array(maxSpheres);
  const by0 = new Float64Array(maxSpheres);
  const bz0 = new Float64Array(maxSpheres);
  const wallXi = new Float64Array(maxSpheres * wallCount * 3);
  const wallMoment = new Float64Array(maxSpheres * wallCount * 3);

  let pairs = createPairList(maxSpheres, Math.max(64, maxSpheres * 8));
  let spare = createPairList(maxSpheres, Math.max(64, maxSpheres * 8));
  let stale = true;

  let bodyCount = 0;
  let sphereCount = 0;
  let time = 0;
  let dt = config.dt ?? 0;
  let maxRadius = 0;

  const domainMin = config.domain.min;
  const domainMax = config.domain.max;
  let cell = 0;
  let gx = 0;
  let gy = 0;
  let gz = 0;
  let nx = 1;
  let ny = 1;
  let nz = 1;
  let cellStart = new Int32Array(2);
  const cellItems = new Int32Array(maxSpheres);
  const cellOf = new Int32Array(maxSpheres);
  let offsetScratch = new Int32Array(1);
  const candidates: number[] = [];

  function refreshBody(b: number): void {
    const lxb = lx[b] ?? 0;
    const lyb = ly[b] ?? 0;
    const lzb = lz[b] ?? 0;
    const at = b * 6;
    if (isotropic[b] === 1) {
      const inv = inverseInertia[at] ?? 0;
      wx[b] = lxb * inv;
      wy[b] = lyb * inv;
      wz[b] = lzb * inv;
      return;
    }
    const w = qw[b] ?? 1;
    const x = qx[b] ?? 0;
    const y = qy[b] ?? 0;
    const z = qz[b] ?? 0;
    // Body-frame momentum l = Rᵀ L, ω_b = I⁻¹ l, ω = R ω_b.
    const r00 = 1 - 2 * (y * y + z * z);
    const r01 = 2 * (x * y - w * z);
    const r02 = 2 * (x * z + w * y);
    const r10 = 2 * (x * y + w * z);
    const r11 = 1 - 2 * (x * x + z * z);
    const r12 = 2 * (y * z - w * x);
    const r20 = 2 * (x * z - w * y);
    const r21 = 2 * (y * z + w * x);
    const r22 = 1 - 2 * (x * x + y * y);
    const bx = r00 * lxb + r10 * lyb + r20 * lzb;
    const by = r01 * lxb + r11 * lyb + r21 * lzb;
    const bz = r02 * lxb + r12 * lyb + r22 * lzb;
    const ixx = inverseInertia[at] ?? 0;
    const iyy = inverseInertia[at + 1] ?? 0;
    const izz = inverseInertia[at + 2] ?? 0;
    const ixy = inverseInertia[at + 3] ?? 0;
    const ixz = inverseInertia[at + 4] ?? 0;
    const iyz = inverseInertia[at + 5] ?? 0;
    const cx = ixx * bx + ixy * by + ixz * bz;
    const cy = ixy * bx + iyy * by + iyz * bz;
    const cz = ixz * bx + iyz * by + izz * bz;
    wx[b] = r00 * cx + r01 * cy + r02 * cz;
    wy[b] = r10 * cx + r11 * cy + r12 * cz;
    wz[b] = r20 * cx + r21 * cy + r22 * cz;
  }

  function refreshSphereRange(first: number, end: number): void {
    for (let s = first; s < end; s += 1) {
      const b = sphereBody[s] ?? 0;
      const ofx = ox[s] ?? 0;
      const ofy = oy[s] ?? 0;
      const ofz = oz[s] ?? 0;
      if (ofx === 0 && ofy === 0 && ofz === 0) {
        sx[s] = px[b] ?? 0;
        sy[s] = py[b] ?? 0;
        sz[s] = pz[b] ?? 0;
        continue;
      }
      const w = qw[b] ?? 1;
      const x = qx[b] ?? 0;
      const y = qy[b] ?? 0;
      const z = qz[b] ?? 0;
      // v' = v + 2w (q × v) + 2 q × (q × v)
      const cx1 = y * ofz - z * ofy;
      const cy1 = z * ofx - x * ofz;
      const cz1 = x * ofy - y * ofx;
      const cx2 = y * cz1 - z * cy1;
      const cy2 = z * cx1 - x * cz1;
      const cz2 = x * cy1 - y * cx1;
      sx[s] = (px[b] ?? 0) + ofx + 2 * (w * cx1 + cx2);
      sy[s] = (py[b] ?? 0) + ofy + 2 * (w * cy1 + cy2);
      sz[s] = (pz[b] ?? 0) + ofz + 2 * (w * cz1 + cz2);
    }
  }

  function setInertia(b: number, ixx: number, iyy: number, izz: number, ixy: number, ixz: number, iyz: number, single: boolean): void {
    const at = b * 6;
    isotropic[b] = single ? 1 : 0;
    if (single) {
      inverseInertia[at] = 1 / ixx;
      return;
    }
    const det = ixx * (iyy * izz - iyz * iyz) - ixy * (ixy * izz - iyz * ixz) + ixz * (ixy * iyz - iyy * ixz);
    inverseInertia[at] = (iyy * izz - iyz * iyz) / det;
    inverseInertia[at + 1] = (ixx * izz - ixz * ixz) / det;
    inverseInertia[at + 2] = (ixx * iyy - ixy * ixy) / det;
    inverseInertia[at + 3] = (ixz * iyz - ixy * izz) / det;
    inverseInertia[at + 4] = (ixy * iyz - ixz * iyy) / det;
    inverseInertia[at + 5] = (ixy * ixz - ixx * iyz) / det;
  }

  function addBody(spec: DemBodySpec): number {
    const material = materials[spec.material];
    if (material === undefined) throw new Error(`discreteElements: no material ${spec.material}`);
    const parts: readonly DemSphereSpec[] = spec.spheres ?? [{ offset: [0, 0, 0], radius: spec.radius ?? 0 }];
    if (bodyCount >= maxBodies || sphereCount + parts.length > maxSpheres) throw new Error("discreteElements: capacity reached");
    let volume = 0;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const part of parts) {
      if (!(part.radius > 0)) throw new Error("discreteElements: a sphere needs a positive radius");
      const v = (4 / 3) * Math.PI * part.radius ** 3;
      volume += v;
      cx += part.offset[0] * v;
      cy += part.offset[1] * v;
      cz += part.offset[2] * v;
    }
    cx /= volume;
    cy /= volume;
    cz /= volume;
    const m = spec.mass ?? material.density * volume;
    const b = bodyCount;
    bodyCount += 1;
    firstSphere[b] = sphereCount;
    sphereTotal[b] = parts.length;
    // Inertia about the centroid: each sphere's 2/5 m r² plus its parallel-axis term, mass shared by volume.
    let ixx = 0;
    let iyy = 0;
    let izz = 0;
    let ixy = 0;
    let ixz = 0;
    let iyz = 0;
    let smallest = Infinity;
    for (const part of parts) {
      const share = (m * ((4 / 3) * Math.PI * part.radius ** 3)) / volume;
      const dx = part.offset[0] - cx;
      const dy = part.offset[1] - cy;
      const dz = part.offset[2] - cz;
      const own = 0.4 * share * part.radius * part.radius;
      ixx += own + share * (dy * dy + dz * dz);
      iyy += own + share * (dx * dx + dz * dz);
      izz += own + share * (dx * dx + dy * dy);
      ixy -= share * dx * dy;
      ixz -= share * dx * dz;
      iyz -= share * dy * dz;
      smallest = Math.min(smallest, part.radius);
      const s = sphereCount;
      sphereCount += 1;
      sphereBody[s] = b;
      sphereRadius[s] = part.radius;
      ox[s] = dx;
      oy[s] = dy;
      oz[s] = dz;
      maxRadius = Math.max(maxRadius, part.radius);
    }
    const single = parts.length === 1;
    setInertia(b, ixx, iyy, izz, ixy, ixz, iyz, single);
    rollingInertia[b] = 1.4 * m * smallest * smallest;
    mass[b] = m;
    fixed[b] = spec.fixed === true ? 1 : 0;
    bodyMaterial[b] = spec.material;
    qw[b] = 1;
    qx[b] = 0;
    qy[b] = 0;
    qz[b] = 0;
    const w0 = spec.angularVelocity ?? [0, 0, 0];
    // L = I ω with the body unrotated.
    lx[b] = single ? w0[0] * ixx : ixx * w0[0] + ixy * w0[1] + ixz * w0[2];
    ly[b] = single ? w0[1] * ixx : ixy * w0[0] + iyy * w0[1] + iyz * w0[2];
    lz[b] = single ? w0[2] * ixx : ixz * w0[0] + iyz * w0[1] + izz * w0[2];
    place(b, [spec.position[0], spec.position[1], spec.position[2]], spec.velocity ?? [0, 0, 0]);
    if (config.dt === undefined && time === 0) {
      const candidate = 0.2 * rayleighTime(material, smallest);
      dt = dt === 0 ? candidate : Math.min(dt, candidate);
    }
    return b;
  }

  function place(b: number, position: Vec3, velocity: Vec3): void {
    px[b] = position[0];
    py[b] = position[1];
    pz[b] = position[2];
    vx[b] = velocity[0];
    vy[b] = velocity[1];
    vz[b] = velocity[2];
    active[b] = 1;
    refreshBody(b);
    const first = firstSphere[b] ?? 0;
    const end = first + (sphereTotal[b] ?? 0);
    refreshSphereRange(first, end);
    for (let s = first; s < end; s += 1) clearWallHistory(s);
    stale = true;
  }

  function clearWallHistory(s: number): void {
    const at = s * wallCount * 3;
    wallXi.fill(0, at, at + wallCount * 3);
    wallMoment.fill(0, at, at + wallCount * 3);
  }

  function wallOffset(w: number): Vec3 {
    const at = w * WALL_STRIDE;
    return [wallState[at] ?? 0, wallState[at + 1] ?? 0, wallState[at + 2] ?? 0];
  }

  function setWallMotion(w: number, motion: DemWallMotion): void {
    if (walls[w] === undefined) throw new Error(`discreteElements: no wall ${w}`);
    const at = w * WALL_STRIDE;
    // The new motion starts from where the wall is now.
    wallBase[w * 3] = wallState[at] ?? 0;
    wallBase[w * 3 + 1] = wallState[at + 1] ?? 0;
    wallBase[w * 3 + 2] = wallState[at + 2] ?? 0;
    const v = motion.velocity ?? [0, 0, 0];
    const a = motion.amplitude ?? [0, 0, 0];
    wallState[at + 3] = v[0];
    wallState[at + 4] = v[1];
    wallState[at + 5] = v[2];
    wallState[at + 6] = a[0];
    wallState[at + 7] = a[1];
    wallState[at + 8] = a[2];
    wallState[at + 9] = motion.frequency ?? 0;
    wallState[at + 10] = time;
  }

  function wallKinematics(t: number): void {
    for (let w = 0; w < wallCount; w += 1) {
      const at = w * WALL_STRIDE;
      const elapsed = t - (wallState[at + 10] ?? 0);
      const omega = 2 * Math.PI * (wallState[at + 9] ?? 0);
      const sin = Math.sin(omega * elapsed);
      const cos = Math.cos(omega * elapsed);
      for (let k = 0; k < 3; k += 1) {
        const v = wallState[at + 3 + k] ?? 0;
        const a = wallState[at + 6 + k] ?? 0;
        wallState[at + k] = (wallBase[w * 3 + k] ?? 0) + v * elapsed + a * sin;
        wallVel[w * 3 + k] = v + a * omega * cos;
      }
    }
  }

  /** Fit the grid to the grains' bounding box inside the domain, so building lists costs O(grains). */
  function fitGrid(): number {
    let x0 = Infinity;
    let y0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let z1 = -Infinity;
    for (let s = 0; s < sphereCount; s += 1) {
      if (active[sphereBody[s] ?? 0] !== 1) continue;
      const x = sx[s] ?? 0;
      const y = sy[s] ?? 0;
      const z = sz[s] ?? 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
    }
    if (x0 > x1) {
      nx = 1;
      ny = 1;
      nz = 1;
      return 1;
    }
    gx = Math.max(x0, domainMin[0]);
    gy = Math.max(y0, domainMin[1]);
    gz = Math.max(z0, domainMin[2]);
    nx = Math.max(1, Math.floor((Math.min(x1, domainMax[0]) - gx) / cell) + 1);
    ny = Math.max(1, Math.floor((Math.min(y1, domainMax[1]) - gy) / cell) + 1);
    nz = Math.max(1, Math.floor((Math.min(z1, domainMax[2]) - gz) / cell) + 1);
    const cells = nx * ny * nz;
    if (cells > 8_000_000) throw new Error(`discreteElements: grid of ${cells} cells exceeds the bound; enlarge grains or shrink the domain`);
    if (cellStart.length < cells + 1) cellStart = new Int32Array(Math.max(cells + 1, cellStart.length * 2));
    return cells;
  }

  /** Rebuild the pair lists from the grid, carrying each surviving pair's history across. */
  function buildPairs(): void {
    const skin = SKIN * maxRadius;
    cell = 2 * maxRadius + rupture + skin;
    const cells = fitGrid();
    cellStart.fill(0, 0, cells + 1);
    for (let s = 0; s < sphereCount; s += 1) {
      if (active[sphereBody[s] ?? 0] !== 1) {
        cellOf[s] = -1;
        continue;
      }
      const ix = Math.min(nx - 1, Math.max(0, Math.floor(((sx[s] ?? 0) - gx) / cell)));
      const iy = Math.min(ny - 1, Math.max(0, Math.floor(((sy[s] ?? 0) - gy) / cell)));
      const iz = Math.min(nz - 1, Math.max(0, Math.floor(((sz[s] ?? 0) - gz) / cell)));
      const c = (iz * ny + iy) * nx + ix;
      cellOf[s] = c;
      cellStart[c + 1] = (cellStart[c + 1] ?? 0) + 1;
    }
    for (let c = 0; c < cells; c += 1) cellStart[c + 1] = (cellStart[c + 1] ?? 0) + (cellStart[c] ?? 0);
    if (offsetScratch.length < cells) offsetScratch = new Int32Array(cells);
    for (let c = 0; c < cells; c += 1) offsetScratch[c] = cellStart[c] ?? 0;
    for (let s = 0; s < sphereCount; s += 1) {
      const c = cellOf[s] ?? -1;
      if (c < 0) continue;
      const slot = offsetScratch[c] ?? 0;
      cellItems[slot] = s;
      offsetScratch[c] = slot + 1;
    }
    const old = pairs;
    let next = spare;
    let count = 0;
    for (let s = 0; s < sphereCount; s += 1) {
      next.start[s] = count;
      const c = cellOf[s] ?? -1;
      if (c < 0) continue;
      gather(s, c, skin);
      next = ensurePairCapacity(next, count + candidates.length);
      // Merge with the old ascending row to carry history.
      let o = old.start[s] ?? 0;
      const oEnd = old.start[s + 1] ?? 0;
      for (const t of candidates) {
        while (o < oEnd && (old.partner[o] ?? 0) < t) o += 1;
        next.partner[count] = t;
        if (o < oEnd && old.partner[o] === t) {
          for (let k = 0; k < 3; k += 1) {
            next.xi[count * 3 + k] = old.xi[o * 3 + k] ?? 0;
            next.moment[count * 3 + k] = old.moment[o * 3 + k] ?? 0;
          }
          next.wet[count] = old.wet[o] ?? 0;
        } else {
          for (let k = 0; k < 3; k += 1) {
            next.xi[count * 3 + k] = 0;
            next.moment[count * 3 + k] = 0;
          }
          next.wet[count] = 0;
        }
        count += 1;
      }
    }
    next.start[sphereCount] = count;
    spare = old;
    pairs = next;
    if (spare.start.length !== pairs.start.length) spare.start = new Int32Array(pairs.start.length);
    for (let s = 0; s < sphereCount; s += 1) {
      bx0[s] = sx[s] ?? 0;
      by0[s] = sy[s] ?? 0;
      bz0[s] = sz[s] ?? 0;
    }
    stale = false;
  }

  /** Partners of sphere s within reach, ascending. */
  function gather(s: number, c: number, skin: number): void {
    candidates.length = 0;
    const ix = c % nx;
    const iy = Math.floor(c / nx) % ny;
    const iz = Math.floor(c / (nx * ny));
    const bi = sphereBody[s] ?? 0;
    const ri = sphereRadius[s] ?? 0;
    const xi = sx[s] ?? 0;
    const yi = sy[s] ?? 0;
    const zi = sz[s] ?? 0;
    const x0 = ix > 0 ? ix - 1 : 0;
    const x1 = ix < nx - 1 ? ix + 1 : ix;
    for (let kz = iz > 0 ? iz - 1 : 0; kz <= (iz < nz - 1 ? iz + 1 : iz); kz += 1) {
      for (let ky = iy > 0 ? iy - 1 : 0; ky <= (iy < ny - 1 ? iy + 1 : iy); ky += 1) {
        const row = (kz * ny + ky) * nx;
        const end = cellStart[row + x1 + 1] ?? 0;
        for (let at = cellStart[row + x0] ?? 0; at < end; at += 1) {
          const t = cellItems[at] ?? 0;
          if (t <= s || sphereBody[t] === bi) continue;
          const ddx = (sx[t] ?? 0) - xi;
          const ddy = (sy[t] ?? 0) - yi;
          const ddz = (sz[t] ?? 0) - zi;
          const reach = ri + (sphereRadius[t] ?? 0) + rupture + skin;
          if (ddx * ddx + ddy * ddy + ddz * ddz < reach * reach) candidates.push(t);
        }
      }
    }
    candidates.sort((a, b) => a - b);
  }

  function needsRebuild(): boolean {
    if (stale) return true;
    const limit = ((SKIN * maxRadius) / 2) ** 2;
    for (let s = 0; s < sphereCount; s += 1) {
      const dx = (sx[s] ?? 0) - (bx0[s] ?? 0);
      const dy = (sy[s] ?? 0) - (by0[s] ?? 0);
      const dz = (sz[s] ?? 0) - (bz0[s] ?? 0);
      if (dx * dx + dy * dy + dz * dz > limit) return true;
    }
    return false;
  }

  // Outputs of the shared contact law.
  let outFx = 0;
  let outFy = 0;
  let outFz = 0;
  let outMx = 0;
  let outMy = 0;
  let outMz = 0;
  let outLoad = 0;

  /**
   * Hertz–Mindlin force on grain i from a contact with unit normal n (from i into the other side), overlap δ,
   * contact velocity v = v_i − v_j and relative spin ω_i − ω_j. Updates the spring history at `at` and leaves the
   * force on i in outF* and its rolling moment in outM*.
   */
  function contactLaw(
    xiStore: Float64Array,
    momentStore: Float64Array,
    at: number,
    law: PairLaw,
    nX: number,
    nY: number,
    nZ: number,
    overlap: number,
    rStar: number,
    mStar: number,
    iRoll: number,
    rvx: number,
    rvy: number,
    rvz: number,
    rwx: number,
    rwy: number,
    rwz: number,
  ): void {
    const root = Math.sqrt(rStar * overlap);
    const sn = 2 * law.effectiveModulus * root;
    const vn = rvx * nX + rvy * nY + rvz * nZ;
    // The dashpot may pull briefly as grains part; that is what makes the rebound match the restitution.
    const fn = (2 / 3) * sn * overlap - 2 * SQRT_5_6 * law.beta * Math.sqrt(sn * mStar) * vn;
    const load = fn > 0 ? fn : 0;
    outLoad = load;
    // Tangential spring, rotated into the current tangent plane with its length kept.
    const tvx = rvx - vn * nX;
    const tvy = rvy - vn * nY;
    const tvz = rvz - vn * nZ;
    let xx = xiStore[at] ?? 0;
    let xy = xiStore[at + 1] ?? 0;
    let xz = xiStore[at + 2] ?? 0;
    const before = Math.sqrt(xx * xx + xy * xy + xz * xz);
    if (before > 0) {
      const along = xx * nX + xy * nY + xz * nZ;
      xx -= along * nX;
      xy -= along * nY;
      xz -= along * nZ;
      const after = Math.sqrt(xx * xx + xy * xy + xz * xz);
      if (after > 0) {
        const scale = before / after;
        xx *= scale;
        xy *= scale;
        xz *= scale;
      }
    }
    xx += tvx * dt;
    xy += tvy * dt;
    xz += tvz * dt;
    const st = 8 * law.effectiveShear * root;
    const gt = -2 * SQRT_5_6 * law.beta * Math.sqrt(st * mStar);
    let ftx = -st * xx - gt * tvx;
    let fty = -st * xy - gt * tvy;
    let ftz = -st * xz - gt * tvz;
    const ft = Math.sqrt(ftx * ftx + fty * fty + ftz * ftz);
    const cap = law.friction * load;
    if (ft > cap) {
      const scale = ft > 0 ? cap / ft : 0;
      ftx *= scale;
      fty *= scale;
      ftz *= scale;
      xx = -ftx / st;
      xy = -fty / st;
      xz = -ftz / st;
    }
    xiStore[at] = xx;
    xiStore[at + 1] = xy;
    xiStore[at + 2] = xz;
    outFx = -fn * nX + ftx;
    outFy = -fn * nY + fty;
    outFz = -fn * nZ + ftz;
    outMx = 0;
    outMy = 0;
    outMz = 0;
    if (law.rolling <= 0) return;
    // Rolling: elastic–plastic spring–dashpot on the spin about the tangent axes (Ai et al. 2011).
    const wn = rwx * nX + rwy * nY + rwz * nZ;
    const rx = rwx - wn * nX;
    const ry = rwy - wn * nY;
    const rz = rwz - wn * nZ;
    const kr = 2.25 * sn * law.rolling * law.rolling * rStar * rStar;
    let mx = momentStore[at] ?? 0;
    let my = momentStore[at + 1] ?? 0;
    let mz = momentStore[at + 2] ?? 0;
    const mAlong = mx * nX + my * nY + mz * nZ;
    mx -= mAlong * nX + kr * rx * dt;
    my -= mAlong * nY + kr * ry * dt;
    mz -= mAlong * nZ + kr * rz * dt;
    const mLen = Math.sqrt(mx * mx + my * my + mz * mz);
    const mCap = law.rolling * rStar * load;
    if (mLen > mCap) {
      const scale = mLen > 0 ? mCap / mLen : 0;
      mx *= scale;
      my *= scale;
      mz *= scale;
      outMx = mx;
      outMy = my;
      outMz = mz;
    } else {
      const damping = ROLLING_DAMPING * 2 * Math.sqrt(iRoll * kr);
      outMx = mx - damping * rx;
      outMy = my - damping * ry;
      outMz = mz - damping * rz;
    }
    momentStore[at] = mx;
    momentStore[at + 1] = my;
    momentStore[at + 2] = mz;
  }

  function applyAt(b: number, cx: number, cy: number, cz: number, ffx: number, ffy: number, ffz: number, mx: number, my: number, mz: number): void {
    fx[b] = (fx[b] ?? 0) + ffx;
    fy[b] = (fy[b] ?? 0) + ffy;
    fz[b] = (fz[b] ?? 0) + ffz;
    const rx = cx - (px[b] ?? 0);
    const ry = cy - (py[b] ?? 0);
    const rz = cz - (pz[b] ?? 0);
    tx[b] = (tx[b] ?? 0) + ry * ffz - rz * ffy + mx;
    ty[b] = (ty[b] ?? 0) + rz * ffx - rx * ffz + my;
    tz[b] = (tz[b] ?? 0) + rx * ffy - ry * ffx + mz;
  }

  let contactCount = 0;
  let maxOverlap = 0;

  const maxBonds = config.maxBonds ?? 0;
  let bondTotal = 0;
  let bondsBroken = 0;
  const bondEnds = new Int32Array(maxBonds * 2);
  // Per bond: radius, k̄n, k̄s, σ̄c, τ̄c, damping ratio.
  const bondProps = new Float64Array(maxBonds * BOND_PROPS);
  // Per bond, tension positive: Fn, Fs xyz, Mn, Ms xyz; the force and moment the bond puts on its second grain.
  const bondLoad = new Float64Array(maxBonds * BOND_LOAD);
  const bondIntact = new Uint8Array(maxBonds);

  function addBond(a: number, b: number, spec: DemBondSpec): number {
    if (bondTotal >= maxBonds) throw new Error("discreteElements: bond capacity reached");
    if (a < 0 || b < 0 || a >= bodyCount || b >= bodyCount || a === b) throw new Error(`discreteElements: cannot bond ${a} and ${b}`);
    if (sphereTotal[a] !== 1 || sphereTotal[b] !== 1) throw new Error("discreteElements: bonds join single-sphere grains");
    const ra = sphereRadius[firstSphere[a] ?? 0] ?? 0;
    const rb = sphereRadius[firstSphere[b] ?? 0] ?? 0;
    const radius = (spec.radiusMultiplier ?? 1) * Math.min(ra, rb);
    const kn = spec.modulus / (ra + rb);
    const k = bondTotal;
    bondTotal += 1;
    bondEnds[k * 2] = a;
    bondEnds[k * 2 + 1] = b;
    const at = k * BOND_PROPS;
    bondProps[at] = radius;
    bondProps[at + 1] = kn;
    bondProps[at + 2] = kn / (spec.stiffnessRatio ?? 2.5);
    bondProps[at + 3] = spec.tensileStrength;
    bondProps[at + 4] = spec.shearStrength;
    bondProps[at + 5] = spec.damping ?? 0.05;
    bondLoad.fill(0, k * BOND_LOAD, (k + 1) * BOND_LOAD);
    bondIntact[k] = 1;
    if (config.dt === undefined && time === 0) {
      const lighter = fixed[a] === 1 ? (mass[b] ?? 0) : fixed[b] === 1 ? (mass[a] ?? 0) : Math.min(mass[a] ?? 0, mass[b] ?? 0);
      const candidate = 0.2 * Math.sqrt(lighter / (kn * Math.PI * radius * radius));
      dt = dt === 0 ? candidate : Math.min(dt, candidate);
    }
    return k;
  }

  function bondTouching(spec: DemBondSpec | ((a: number, b: number) => DemBondSpec), tolerance = 0.05): number {
    buildPairs();
    let made = 0;
    for (let s = 0; s < sphereCount; s += 1) {
      const bi = sphereBody[s] ?? 0;
      if (sphereTotal[bi] !== 1) continue;
      const end = pairs.start[s + 1] ?? 0;
      for (let e = pairs.start[s] ?? 0; e < end; e += 1) {
        const t = pairs.partner[e] ?? 0;
        const bj = sphereBody[t] ?? 0;
        if (sphereTotal[bj] !== 1) continue;
        const ri = sphereRadius[s] ?? 0;
        const rj = sphereRadius[t] ?? 0;
        const gap = Math.hypot((sx[t] ?? 0) - (sx[s] ?? 0), (sy[t] ?? 0) - (sy[s] ?? 0), (sz[t] ?? 0) - (sz[s] ?? 0)) - ri - rj;
        if (gap > tolerance * Math.min(ri, rj)) continue;
        addBond(bi, bj, typeof spec === "function" ? spec(bi, bj) : spec);
        made += 1;
      }
    }
    return made;
  }

  function breakBond(k: number): void {
    bondIntact[k] = 0;
    bondLoad.fill(0, k * BOND_LOAD, (k + 1) * BOND_LOAD);
    bondsBroken += 1;
  }

  /** Parallel-bond forces, Potyondy & Cundall (2004) eqs. 6–12, with the shear history turned onto the current bond plane. */
  function bondForces(): void {
    for (let k = 0; k < bondTotal; k += 1) {
      if (bondIntact[k] !== 1) continue;
      const a = bondEnds[k * 2] ?? 0;
      const b = bondEnds[k * 2 + 1] ?? 0;
      if (active[a] !== 1 || active[b] !== 1) continue;
      const fa = fixed[a] === 1;
      const fb = fixed[b] === 1;
      if (fa && fb) continue;
      const ddx = (px[b] ?? 0) - (px[a] ?? 0);
      const ddy = (py[b] ?? 0) - (py[a] ?? 0);
      const ddz = (pz[b] ?? 0) - (pz[a] ?? 0);
      const dist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
      if (dist === 0) continue;
      const nX = ddx / dist;
      const nY = ddy / dist;
      const nZ = ddz / dist;
      const ra = sphereRadius[firstSphere[a] ?? 0] ?? 0;
      const rb = sphereRadius[firstSphere[b] ?? 0] ?? 0;
      const reachA = ra + (dist - ra - rb) / 2;
      const reachB = reachA - dist;
      const cx = (px[a] ?? 0) + nX * reachA;
      const cy = (py[a] ?? 0) + nY * reachA;
      const cz = (pz[a] ?? 0) + nZ * reachA;
      const wxa = wx[a] ?? 0;
      const wya = wy[a] ?? 0;
      const wza = wz[a] ?? 0;
      const wxb = wx[b] ?? 0;
      const wyb = wy[b] ?? 0;
      const wzb = wz[b] ?? 0;
      // Velocity of b's side of the bond relative to a's, at the bond centre.
      const rvx = (vx[b] ?? 0) + (wyb * nZ - wzb * nY) * reachB - ((vx[a] ?? 0) + (wya * nZ - wza * nY) * reachA);
      const rvy = (vy[b] ?? 0) + (wzb * nX - wxb * nZ) * reachB - ((vy[a] ?? 0) + (wza * nX - wxa * nZ) * reachA);
      const rvz = (vz[b] ?? 0) + (wxb * nY - wyb * nX) * reachB - ((vz[a] ?? 0) + (wxa * nY - wya * nX) * reachA);
      const vn = rvx * nX + rvy * nY + rvz * nZ;
      const vtx = rvx - vn * nX;
      const vty = rvy - vn * nY;
      const vtz = rvz - vn * nZ;
      const owx = wxb - wxa;
      const owy = wyb - wya;
      const owz = wzb - wza;
      const on = owx * nX + owy * nY + owz * nZ;
      const otx = owx - on * nX;
      const oty = owy - on * nY;
      const otz = owz - on * nZ;

      const p = k * BOND_PROPS;
      const radius = bondProps[p] ?? 0;
      const kn = bondProps[p + 1] ?? 0;
      const ks = bondProps[p + 2] ?? 0;
      const area = Math.PI * radius * radius;
      const bend = (area * radius * radius) / 4;
      const twist = 2 * bend;
      const l = k * BOND_LOAD;
      const fn = (bondLoad[l] ?? 0) + kn * area * vn * dt;
      let fsx = bondLoad[l + 1] ?? 0;
      let fsy = bondLoad[l + 2] ?? 0;
      let fsz = bondLoad[l + 3] ?? 0;
      const fsOld = Math.sqrt(fsx * fsx + fsy * fsy + fsz * fsz);
      if (fsOld > 0) {
        const off = fsx * nX + fsy * nY + fsz * nZ;
        fsx -= off * nX;
        fsy -= off * nY;
        fsz -= off * nZ;
        const fsNew = Math.sqrt(fsx * fsx + fsy * fsy + fsz * fsz);
        const scale = fsNew > 0 ? fsOld / fsNew : 0;
        fsx *= scale;
        fsy *= scale;
        fsz *= scale;
      }
      fsx -= ks * area * vtx * dt;
      fsy -= ks * area * vty * dt;
      fsz -= ks * area * vtz * dt;
      const mn = (bondLoad[l + 4] ?? 0) - ks * twist * on * dt;
      let msx = bondLoad[l + 5] ?? 0;
      let msy = bondLoad[l + 6] ?? 0;
      let msz = bondLoad[l + 7] ?? 0;
      const msOld = Math.sqrt(msx * msx + msy * msy + msz * msz);
      if (msOld > 0) {
        const off = msx * nX + msy * nY + msz * nZ;
        msx -= off * nX;
        msy -= off * nY;
        msz -= off * nZ;
        const msNew = Math.sqrt(msx * msx + msy * msy + msz * msz);
        const scale = msNew > 0 ? msOld / msNew : 0;
        msx *= scale;
        msy *= scale;
        msz *= scale;
      }
      msx -= kn * bend * otx * dt;
      msy -= kn * bend * oty * dt;
      msz -= kn * bend * otz * dt;
      const tensile = fn / area + (Math.sqrt(msx * msx + msy * msy + msz * msz) * radius) / bend;
      const shear = Math.sqrt(fsx * fsx + fsy * fsy + fsz * fsz) / area + (Math.abs(mn) * radius) / twist;
      if (tensile >= (bondProps[p + 3] ?? 0) || shear >= (bondProps[p + 4] ?? 0)) {
        breakBond(k);
        continue;
      }
      bondLoad[l] = fn;
      bondLoad[l + 1] = fsx;
      bondLoad[l + 2] = fsy;
      bondLoad[l + 3] = fsz;
      bondLoad[l + 4] = mn;
      bondLoad[l + 5] = msx;
      bondLoad[l + 6] = msy;
      bondLoad[l + 7] = msz;

      // A dashpot in parallel on each spring, a fraction of its critical value.
      const ma = mass[a] ?? 1;
      const mb = mass[b] ?? 1;
      const mStar = fa ? mb : fb ? ma : (ma * mb) / (ma + mb);
      const r = Math.min(ra, rb);
      const iStar = 0.4 * mStar * r * r;
      const zeta = 2 * (bondProps[p + 5] ?? 0);
      const cn = zeta * Math.sqrt(mStar * kn * area);
      const cs = zeta * Math.sqrt(mStar * ks * area);
      const cb = zeta * Math.sqrt(iStar * kn * bend);
      const ct = zeta * Math.sqrt(iStar * ks * twist);
      const pull = fn + cn * vn;
      const ffx = -pull * nX + fsx - cs * vtx;
      const ffy = -pull * nY + fsy - cs * vty;
      const ffz = -pull * nZ + fsz - cs * vtz;
      const twistOut = mn - ct * on;
      const mx = twistOut * nX + msx - cb * otx;
      const my = twistOut * nY + msy - cb * oty;
      const mz = twistOut * nZ + msz - cb * otz;
      applyAt(b, cx, cy, cz, ffx, ffy, ffz, mx, my, mz);
      applyAt(a, cx, cy, cz, -ffx, -ffy, -ffz, -mx, -my, -mz);
    }
  }

  function pairForces(): void {
    const list = pairs;
    for (let s = 0; s < sphereCount; s += 1) {
      const end = list.start[s + 1] ?? 0;
      for (let e = list.start[s] ?? 0; e < end; e += 1) pairForce(list, e, s, list.partner[e] ?? 0);
    }
  }

  function clearPair(list: PairList, e: number): void {
    const at = e * 3;
    list.xi[at] = 0;
    list.xi[at + 1] = 0;
    list.xi[at + 2] = 0;
    list.moment[at] = 0;
    list.moment[at + 1] = 0;
    list.moment[at + 2] = 0;
  }

  function pairForce(list: PairList, e: number, s: number, t: number): void {
    const bi = sphereBody[s] ?? 0;
    const bj = sphereBody[t] ?? 0;
    if (active[bi] !== 1 || active[bj] !== 1) return;
    const xi = sx[s] ?? 0;
    const yi = sy[s] ?? 0;
    const zi = sz[s] ?? 0;
    const ddx = (sx[t] ?? 0) - xi;
    const ddy = (sy[t] ?? 0) - yi;
    const ddz = (sz[t] ?? 0) - zi;
    const ri = sphereRadius[s] ?? 0;
    const rj = sphereRadius[t] ?? 0;
    const sum = ri + rj;
    const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
    const reach = sum + rupture;
    if (d2 >= reach * reach) {
      if (list.wet[e] === 1 || list.xi[e * 3] !== 0 || list.xi[e * 3 + 1] !== 0 || list.xi[e * 3 + 2] !== 0) {
        clearPair(list, e);
        list.wet[e] = 0;
      }
      return;
    }
    const dist = Math.sqrt(d2);
    const overlap = sum - dist;
    const inv = 1 / dist;
    const nX = ddx * inv;
    const nY = ddy * inv;
    const nZ = ddz * inv;
    if (overlap <= 0) {
      clearPair(list, e);
      // Only a standing liquid bridge acts across a gap.
      if (liquid === undefined || list.wet[e] !== 1) return;
      const gap = -overlap;
      const f = capillaryForce(liquid, (2 * ri * rj) / sum, gap);
      const cx = xi + nX * (ri + gap / 2);
      const cy = yi + nY * (ri + gap / 2);
      const cz = zi + nZ * (ri + gap / 2);
      applyAt(bi, cx, cy, cz, f * nX, f * nY, f * nZ, 0, 0, 0);
      applyAt(bj, cx, cy, cz, -f * nX, -f * nY, -f * nZ, 0, 0, 0);
      return;
    }
    contactCount += 1;
    const ratio = overlap / (ri < rj ? ri : rj);
    if (ratio > maxOverlap) maxOverlap = ratio;
    if (liquid !== undefined) list.wet[e] = 1;
    const reachI = ri - overlap / 2;
    const cx = xi + nX * reachI;
    const cy = yi + nY * reachI;
    const cz = zi + nZ * reachI;
    const ax = cx - (px[bi] ?? 0);
    const ay = cy - (py[bi] ?? 0);
    const az = cz - (pz[bi] ?? 0);
    const bx = cx - (px[bj] ?? 0);
    const by = cy - (py[bj] ?? 0);
    const bz = cz - (pz[bj] ?? 0);
    const wxi = wx[bi] ?? 0;
    const wyi = wy[bi] ?? 0;
    const wzi = wz[bi] ?? 0;
    const wxj = wx[bj] ?? 0;
    const wyj = wy[bj] ?? 0;
    const wzj = wz[bj] ?? 0;
    const rvx = (vx[bi] ?? 0) + wyi * az - wzi * ay - ((vx[bj] ?? 0) + wyj * bz - wzj * by);
    const rvy = (vy[bi] ?? 0) + wzi * ax - wxi * az - ((vy[bj] ?? 0) + wzj * bx - wxj * bz);
    const rvz = (vz[bi] ?? 0) + wxi * ay - wyi * ax - ((vz[bj] ?? 0) + wxj * by - wyj * bx);
    // A fixed grain has infinite mass and inertia, so the reduced values are the mobile grain's.
    const fi = fixed[bi] === 1;
    const fj = fixed[bj] === 1;
    if (fi && fj) return;
    const mi = mass[bi] ?? 1;
    const mj = mass[bj] ?? 1;
    const ii = rollingInertia[bi] ?? 1;
    const ij = rollingInertia[bj] ?? 1;
    const mStar = fi ? mj : fj ? mi : (mi * mj) / (mi + mj);
    const iStar = fi ? ij : fj ? ii : (ii * ij) / (ii + ij);
    const law = lawOf(bodyMaterial[bi] ?? 0, bodyMaterial[bj] ?? 0);
    contactLaw(list.xi, list.moment, e * 3, law, nX, nY, nZ, overlap, (ri * rj) / sum, mStar, iStar, rvx, rvy, rvz, wxi - wxj, wyi - wyj, wzi - wzj);
    let ffx = outFx;
    let ffy = outFy;
    let ffz = outFz;
    if (liquid !== undefined) {
      const f = capillaryForce(liquid, (2 * ri * rj) / sum, 0);
      ffx += f * nX;
      ffy += f * nY;
      ffz += f * nZ;
    }
    applyAt(bi, cx, cy, cz, ffx, ffy, ffz, outMx, outMy, outMz);
    applyAt(bj, cx, cy, cz, -ffx, -ffy, -ffz, -outMx, -outMy, -outMz);
  }

  function wallForces(): void {
    wallForce.fill(0);
    wallNormalForce.fill(0);
    if (wallCount === 0) return;
    for (let s = 0; s < sphereCount; s += 1) {
      const b = sphereBody[s] ?? 0;
      if (active[b] !== 1 || fixed[b] === 1) continue;
      for (let w = 0; w < wallCount; w += 1) wallContact(s, b, w);
    }
  }

  function wallContact(s: number, b: number, w: number): void {
    const wall = walls[w];
    if (wall === undefined) return;
    const r = sphereRadius[s] ?? 0;
    const at = w * WALL_STRIDE;
    const anchor = wall.kind === "plane" ? wall.point : wall.center;
    const rx = (sx[s] ?? 0) - anchor[0] - (wallState[at] ?? 0);
    const ry = (sy[s] ?? 0) - anchor[1] - (wallState[at + 1] ?? 0);
    const rz = (sz[s] ?? 0) - anchor[2] - (wallState[at + 2] ?? 0);
    // Unit normal from the sphere centre into the wall, and the overlap along it.
    let nX = 0;
    let nY = 0;
    let nZ = 0;
    let overlap = 0;
    if (wall.kind === "plane") {
      const n = wall.normal;
      const h = rx * n[0] + ry * n[1] + rz * n[2];
      overlap = r - h;
      nX = -n[0];
      nY = -n[1];
      nZ = -n[2];
    } else if (wall.kind === "disc") {
      const n = wall.normal;
      const h = rx * n[0] + ry * n[1] + rz * n[2];
      if (h < r && h > -r) {
        const qx2 = rx - h * n[0];
        const qy2 = ry - h * n[1];
        const qz2 = rz - h * n[2];
        const rho = Math.sqrt(qx2 * qx2 + qy2 * qy2 + qz2 * qz2);
        let scale = 1;
        if (rho < wall.innerRadius) scale = rho > 0 ? wall.innerRadius / rho : 0;
        else if (rho > wall.outerRadius) scale = wall.outerRadius / rho;
        // Closest annulus point: the foot on the plane, or the nearest rim point.
        const ddx = qx2 * scale - rx;
        const ddy = qy2 * scale - ry;
        const ddz = qz2 * scale - rz;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
        if (scale > 0 && dist > 0) {
          overlap = r - dist;
          nX = ddx / dist;
          nY = ddy / dist;
          nZ = ddz / dist;
        }
      }
    } else {
      const a = wall.axis;
      const h = rx * a[0] + ry * a[1] + rz * a[2];
      if (h >= 0 && h <= wall.length) {
        const qx2 = rx - h * a[0];
        const qy2 = ry - h * a[1];
        const qz2 = rz - h * a[2];
        const rho = Math.sqrt(qx2 * qx2 + qy2 * qy2 + qz2 * qz2);
        if (rho > 0) {
          overlap = r - (wall.radius - rho);
          nX = qx2 / rho;
          nY = qy2 / rho;
          nZ = qz2 / rho;
        }
      }
    }
    const hist = (s * wallCount + w) * 3;
    if (overlap <= 0) {
      if (wallXi[hist] !== 0 || wallXi[hist + 1] !== 0 || wallXi[hist + 2] !== 0 || wallMoment[hist] !== 0) {
        wallXi.fill(0, hist, hist + 3);
        wallMoment.fill(0, hist, hist + 3);
      }
      return;
    }
    contactCount += 1;
    const ratio = overlap / r;
    if (ratio > maxOverlap) maxOverlap = ratio;
    const reach = r - overlap / 2;
    const cx = (sx[s] ?? 0) + nX * reach;
    const cy = (sy[s] ?? 0) + nY * reach;
    const cz = (sz[s] ?? 0) + nZ * reach;
    const ax = cx - (px[b] ?? 0);
    const ay = cy - (py[b] ?? 0);
    const az = cz - (pz[b] ?? 0);
    const wxi = wx[b] ?? 0;
    const wyi = wy[b] ?? 0;
    const wzi = wz[b] ?? 0;
    const rvx = (vx[b] ?? 0) + wyi * az - wzi * ay - (wallVel[w * 3] ?? 0);
    const rvy = (vy[b] ?? 0) + wzi * ax - wxi * az - (wallVel[w * 3 + 1] ?? 0);
    const rvz = (vz[b] ?? 0) + wxi * ay - wyi * ax - (wallVel[w * 3 + 2] ?? 0);
    const law = lawOf(bodyMaterial[b] ?? 0, wall.material);
    contactLaw(wallXi, wallMoment, hist, law, nX, nY, nZ, overlap, r, mass[b] ?? 1, rollingInertia[b] ?? 1, rvx, rvy, rvz, wxi, wyi, wzi);
    applyAt(b, cx, cy, cz, outFx, outFy, outFz, outMx, outMy, outMz);
    wallForce[w * 3] = (wallForce[w * 3] ?? 0) - outFx;
    wallForce[w * 3 + 1] = (wallForce[w * 3 + 1] ?? 0) - outFy;
    wallForce[w * 3 + 2] = (wallForce[w * 3 + 2] ?? 0) - outFz;
    wallNormalForce[w] = (wallNormalForce[w] ?? 0) + outLoad;
  }

  function integrate(exited: number[]): void {
    for (let b = 0; b < bodyCount; b += 1) {
      if (active[b] !== 1) continue;
      if (fixed[b] === 1) {
        fx[b] = 0;
        fy[b] = 0;
        fz[b] = 0;
        tx[b] = 0;
        ty[b] = 0;
        tz[b] = 0;
        continue;
      }
      const inv = 1 / (mass[b] ?? 1);
      const nvx = (vx[b] ?? 0) + ((fx[b] ?? 0) * inv + gravity[0]) * dt;
      const nvy = (vy[b] ?? 0) + ((fy[b] ?? 0) * inv + gravity[1]) * dt;
      const nvz = (vz[b] ?? 0) + ((fz[b] ?? 0) * inv + gravity[2]) * dt;
      vx[b] = nvx;
      vy[b] = nvy;
      vz[b] = nvz;
      const x = (px[b] ?? 0) + nvx * dt;
      const y = (py[b] ?? 0) + nvy * dt;
      const z = (pz[b] ?? 0) + nvz * dt;
      px[b] = x;
      py[b] = y;
      pz[b] = z;
      lx[b] = (lx[b] ?? 0) + (tx[b] ?? 0) * dt;
      ly[b] = (ly[b] ?? 0) + (ty[b] ?? 0) * dt;
      lz[b] = (lz[b] ?? 0) + (tz[b] ?? 0) * dt;
      if (isotropic[b] !== 1) {
        refreshBody(b);
        const w = qw[b] ?? 1;
        const qxb = qx[b] ?? 0;
        const qyb = qy[b] ?? 0;
        const qzb = qz[b] ?? 0;
        const ax = (wx[b] ?? 0) * dt * 0.5;
        const ay = (wy[b] ?? 0) * dt * 0.5;
        const az = (wz[b] ?? 0) * dt * 0.5;
        const nw = w - ax * qxb - ay * qyb - az * qzb;
        const nqx = qxb + ax * w + ay * qzb - az * qyb;
        const nqy = qyb + ay * w + az * qxb - ax * qzb;
        const nqz = qzb + az * w + ax * qyb - ay * qxb;
        const len = Math.sqrt(nw * nw + nqx * nqx + nqy * nqy + nqz * nqz);
        qw[b] = nw / len;
        qx[b] = nqx / len;
        qy[b] = nqy / len;
        qz[b] = nqz / len;
      }
      refreshBody(b);
      fx[b] = 0;
      fy[b] = 0;
      fz[b] = 0;
      tx[b] = 0;
      ty[b] = 0;
      tz[b] = 0;
      if (x < domainMin[0] || y < domainMin[1] || z < domainMin[2] || x > domainMax[0] || y > domainMax[1] || z > domainMax[2]) {
        active[b] = 0;
        exited.push(b);
        stale = true;
      }
    }
  }

  function step(): DemStepReport {
    if (dt <= 0) throw new Error("discreteElements: add a grain or set dt before stepping");
    if (needsRebuild()) buildPairs();
    contactCount = 0;
    maxOverlap = 0;
    wallKinematics(time);
    bondsBroken = 0;
    pairForces();
    bondForces();
    wallForces();
    const exited: number[] = [];
    integrate(exited);
    time += dt;
    wallKinematics(time);
    refreshSphereRange(0, sphereCount);
    return { exited, contacts: contactCount, maxOverlap, bondsBroken };
  }

  function run(seconds: number): DemStepReport {
    const steps = Math.max(0, Math.round(seconds / dt));
    const exited: number[] = [];
    let contacts = 0;
    let worst = 0;
    let broken = 0;
    for (let i = 0; i < steps; i += 1) {
      const report = step();
      for (const b of report.exited) exited.push(b);
      contacts = report.contacts;
      broken += report.bondsBroken;
      if (report.maxOverlap > worst) worst = report.maxOverlap;
    }
    return { exited, contacts, maxOverlap: worst, bondsBroken: broken };
  }

  function snapshot(): DemSnapshot {
    const bodies: number[] = [];
    const inertia: number[] = [];
    for (let b = 0; b < bodyCount; b += 1) {
      bodies.push(px[b] ?? 0, py[b] ?? 0, pz[b] ?? 0, vx[b] ?? 0, vy[b] ?? 0, vz[b] ?? 0, qw[b] ?? 1, qx[b] ?? 0, qy[b] ?? 0, qz[b] ?? 0, lx[b] ?? 0, ly[b] ?? 0, lz[b] ?? 0, mass[b] ?? 0, active[b] ?? 0, bodyMaterial[b] ?? 0, fixed[b] ?? 0);
      for (let k = 0; k < 6; k += 1) inertia.push(inverseInertia[b * 6 + k] ?? 0);
    }
    const spheres: number[] = [];
    for (let s = 0; s < sphereCount; s += 1) spheres.push(sphereBody[s] ?? 0, ox[s] ?? 0, oy[s] ?? 0, oz[s] ?? 0, sphereRadius[s] ?? 0);
    const contacts: number[] = [];
    if (!stale) {
      for (let s = 0; s < sphereCount; s += 1) {
        const end = pairs.start[s + 1] ?? 0;
        for (let e = pairs.start[s] ?? 0; e < end; e += 1) {
          const values = [pairs.xi[e * 3] ?? 0, pairs.xi[e * 3 + 1] ?? 0, pairs.xi[e * 3 + 2] ?? 0, pairs.moment[e * 3] ?? 0, pairs.moment[e * 3 + 1] ?? 0, pairs.moment[e * 3 + 2] ?? 0];
          const wet = pairs.wet[e] ?? 0;
          if (wet === 0 && values.every((value) => value === 0)) continue;
          contacts.push(s, pairs.partner[e] ?? 0, ...values, wet);
        }
      }
    }
    const wallContacts: number[] = [];
    for (let s = 0; s < sphereCount; s += 1) {
      for (let w = 0; w < wallCount; w += 1) {
        const at = (s * wallCount + w) * 3;
        const values = [wallXi[at] ?? 0, wallXi[at + 1] ?? 0, wallXi[at + 2] ?? 0, wallMoment[at] ?? 0, wallMoment[at + 1] ?? 0, wallMoment[at + 2] ?? 0];
        if (values.some((value) => value !== 0)) wallContacts.push(s, w, ...values);
      }
    }
    const state = [...wallState, ...wallBase];
    const bonds: number[] = [];
    for (let k = 0; k < bondTotal; k += 1) {
      bonds.push(bondEnds[k * 2] ?? 0, bondEnds[k * 2 + 1] ?? 0, bondIntact[k] ?? 0);
      for (let q = 0; q < BOND_PROPS; q += 1) bonds.push(bondProps[k * BOND_PROPS + q] ?? 0);
      for (let q = 0; q < BOND_LOAD; q += 1) bonds.push(bondLoad[k * BOND_LOAD + q] ?? 0);
    }
    return { time, dt, bodyCount, sphereCount, bodies, inertia, spheres, contacts, wallContacts, walls: walls.map((wall) => ({ ...wall })), wallState: state, bonds };
  }

  function restore(snap: DemSnapshot): void {
    if (snap.bodyCount > maxBodies || snap.sphereCount > maxSpheres) throw new Error("discreteElements: snapshot exceeds capacity");
    if (snap.walls.length !== wallCount) throw new Error("discreteElements: snapshot has a different wall count");
    const bondStride = 3 + BOND_PROPS + BOND_LOAD;
    if (snap.bonds.length / bondStride > maxBonds) throw new Error("discreteElements: snapshot exceeds bond capacity");
    bondTotal = snap.bonds.length / bondStride;
    for (let k = 0; k < bondTotal; k += 1) {
      const at = k * bondStride;
      bondEnds[k * 2] = snap.bonds[at] ?? 0;
      bondEnds[k * 2 + 1] = snap.bonds[at + 1] ?? 0;
      bondIntact[k] = snap.bonds[at + 2] ?? 0;
      for (let q = 0; q < BOND_PROPS; q += 1) bondProps[k * BOND_PROPS + q] = snap.bonds[at + 3 + q] ?? 0;
      for (let q = 0; q < BOND_LOAD; q += 1) bondLoad[k * BOND_LOAD + q] = snap.bonds[at + 3 + BOND_PROPS + q] ?? 0;
    }
    time = snap.time;
    dt = snap.dt;
    bodyCount = snap.bodyCount;
    sphereCount = snap.sphereCount;
    maxRadius = 0;
    for (let b = 0; b < bodyCount; b += 1) {
      const at = b * BODY_STRIDE;
      px[b] = snap.bodies[at] ?? 0;
      py[b] = snap.bodies[at + 1] ?? 0;
      pz[b] = snap.bodies[at + 2] ?? 0;
      vx[b] = snap.bodies[at + 3] ?? 0;
      vy[b] = snap.bodies[at + 4] ?? 0;
      vz[b] = snap.bodies[at + 5] ?? 0;
      qw[b] = snap.bodies[at + 6] ?? 1;
      qx[b] = snap.bodies[at + 7] ?? 0;
      qy[b] = snap.bodies[at + 8] ?? 0;
      qz[b] = snap.bodies[at + 9] ?? 0;
      lx[b] = snap.bodies[at + 10] ?? 0;
      ly[b] = snap.bodies[at + 11] ?? 0;
      lz[b] = snap.bodies[at + 12] ?? 0;
      mass[b] = snap.bodies[at + 13] ?? 0;
      active[b] = snap.bodies[at + 14] ?? 0;
      bodyMaterial[b] = snap.bodies[at + 15] ?? 0;
      fixed[b] = snap.bodies[at + 16] ?? 0;
      for (let k = 0; k < 6; k += 1) inverseInertia[b * 6 + k] = snap.inertia[b * 6 + k] ?? 0;
      fx[b] = 0;
      fy[b] = 0;
      fz[b] = 0;
      tx[b] = 0;
      ty[b] = 0;
      tz[b] = 0;
      sphereTotal[b] = 0;
    }
    const smallest = new Float64Array(bodyCount).fill(Infinity);
    for (let s = 0; s < sphereCount; s += 1) {
      const at = s * 5;
      const b = snap.spheres[at] ?? 0;
      sphereBody[s] = b;
      ox[s] = snap.spheres[at + 1] ?? 0;
      oy[s] = snap.spheres[at + 2] ?? 0;
      oz[s] = snap.spheres[at + 3] ?? 0;
      const r = snap.spheres[at + 4] ?? 0;
      sphereRadius[s] = r;
      maxRadius = Math.max(maxRadius, r);
      smallest[b] = Math.min(smallest[b] ?? Infinity, r);
      if ((sphereTotal[b] ?? 0) === 0) firstSphere[b] = s;
      sphereTotal[b] = (sphereTotal[b] ?? 0) + 1;
    }
    for (let b = 0; b < bodyCount; b += 1) {
      const r = smallest[b] ?? 0;
      rollingInertia[b] = 1.4 * (mass[b] ?? 0) * r * r;
      isotropic[b] = sphereTotal[b] === 1 ? 1 : 0;
      refreshBody(b);
    }
    walls = snap.walls.map((wall) => normalizeWall({ ...wall }));
    for (let k = 0; k < wallCount * WALL_STRIDE; k += 1) wallState[k] = snap.wallState[k] ?? 0;
    for (let k = 0; k < wallCount * 3; k += 1) wallBase[k] = snap.wallState[wallCount * WALL_STRIDE + k] ?? 0;
    wallKinematics(time);
    refreshSphereRange(0, sphereCount);
    wallXi.fill(0);
    wallMoment.fill(0);
    for (let at = 0; at + 7 < snap.wallContacts.length; at += 8) {
      const hist = ((snap.wallContacts[at] ?? 0) * wallCount + (snap.wallContacts[at + 1] ?? 0)) * 3;
      for (let k = 0; k < 3; k += 1) {
        wallXi[hist + k] = snap.wallContacts[at + 2 + k] ?? 0;
        wallMoment[hist + k] = snap.wallContacts[at + 5 + k] ?? 0;
      }
    }
    pairs.start.fill(0);
    buildPairs();
    for (let at = 0; at + 8 < snap.contacts.length; at += 9) {
      const s = snap.contacts[at] ?? 0;
      const t = snap.contacts[at + 1] ?? 0;
      const end = pairs.start[s + 1] ?? 0;
      for (let e = pairs.start[s] ?? 0; e < end; e += 1) {
        if (pairs.partner[e] !== t) continue;
        for (let k = 0; k < 3; k += 1) {
          pairs.xi[e * 3 + k] = snap.contacts[at + 2 + k] ?? 0;
          pairs.moment[e * 3 + k] = snap.contacts[at + 5 + k] ?? 0;
        }
        pairs.wet[e] = snap.contacts[at + 8] ?? 0;
        break;
      }
    }
  }

  return {
    materials,
    get bodyCount() {
      return bodyCount;
    },
    get sphereCount() {
      return sphereCount;
    },
    get time() {
      return time;
    },
    get dt() {
      return dt;
    },
    px,
    py,
    pz,
    vx,
    vy,
    vz,
    mass,
    active,
    fixed,
    sphereBody,
    sphereRadius,
    sx,
    sy,
    sz,
    wallForce,
    wallNormalForce,
    get bondCount() {
      return bondTotal;
    },
    bondEnds,
    bondIntact,
    addBody,
    bond: addBond,
    bondTouching,
    bondLoad(bond) {
      const l = bond * BOND_LOAD;
      const radius = bondProps[bond * BOND_PROPS] ?? 0;
      const area = Math.PI * radius * radius;
      const bend = (area * radius * radius) / 4;
      const fn = bondLoad[l] ?? 0;
      const fs = Math.hypot(bondLoad[l + 1] ?? 0, bondLoad[l + 2] ?? 0, bondLoad[l + 3] ?? 0);
      const ms = Math.hypot(bondLoad[l + 5] ?? 0, bondLoad[l + 6] ?? 0, bondLoad[l + 7] ?? 0);
      return { tension: fn, shear: fs, twist: bondLoad[l + 4] ?? 0, bend: ms, tensileStress: fn / area + (ms * radius) / bend, shearStress: fs / area + (Math.abs(bondLoad[l + 4] ?? 0) * radius) / (2 * bend) };
    },
    placeBody(body, position, velocity) {
      if (body < 0 || body >= bodyCount) throw new Error(`discreteElements: no body ${body}`);
      lx[body] = 0;
      ly[body] = 0;
      lz[body] = 0;
      place(body, position, velocity ?? [0, 0, 0]);
    },
    deactivate(body) {
      active[body] = 0;
      stale = true;
    },
    angularVelocity(body) {
      return [wx[body] ?? 0, wy[body] ?? 0, wz[body] ?? 0];
    },
    orientation(body) {
      return [qw[body] ?? 1, qx[body] ?? 0, qy[body] ?? 0, qz[body] ?? 0];
    },
    setWallMotion,
    wallOffset,
    step,
    run,
    kineticEnergy() {
      let energy = 0;
      for (let b = 0; b < bodyCount; b += 1) {
        if (active[b] !== 1) continue;
        const v2 = (vx[b] ?? 0) ** 2 + (vy[b] ?? 0) ** 2 + (vz[b] ?? 0) ** 2;
        energy += 0.5 * (mass[b] ?? 0) * v2 + 0.5 * ((wx[b] ?? 0) * (lx[b] ?? 0) + (wy[b] ?? 0) * (ly[b] ?? 0) + (wz[b] ?? 0) * (lz[b] ?? 0));
      }
      return energy;
    },
    snapshot,
    restore,
  };
}
