// @skill jgengine-world
/**
 * Loose sand, gravel and soil over bedrock as a depth-averaged granular flow on a grid, fast enough to
 * run under a game. Each cell holds a solid volume of one {@link GranularMaterial} at a packing
 * fraction over a fixed bed. Material moves between cells through face velocities driven by the
 * slope of the free surface (the shallow-layer equations of Savage & Hutter 1989, hydrostatic
 * pressure with K = 1) and braked by the basal friction law of Pouliquen & Forterre (2002) plus
 * Mohr–Coulomb cohesion. Friction is applied implicitly, so a heap below its start angle carries no
 * velocity at all and never creeps; above it, it avalanches until the slope falls to the stop angle.
 * Flux is upwinded over the higher bed of each face (the hydrostatic reconstruction of Audusse et al.
 * 2004), so material resting against a bedrock step stays put.
 *
 * Loads sink in by Bekker's pressure–sinkage law: a cell first compacts toward its dense packing and
 * what compaction cannot absorb is pushed into a berm around the footprint, then the berm relaxes as
 * an avalanche. A cell remembers the largest pressure it has carried, so a second pass over a rut
 * only sinks further under a heavier load.
 *
 * Cost follows motion: only awake cells and their faces are visited, a cell sleeps after a few
 * still steps and edits or arriving material wake it. Solid volume is conserved to rounding.
 *
 * @capability granular-flow sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield
 */
import { culmannHeight, flowFriction, plateSinkage, plateSinkagePressure, startFriction, wheelSinkage, type GranularMaterial } from "./granularMaterial";

/** Grid, starting ground and tuning for {@link createGranularLayer}. */
export interface GranularLayerConfig {
  /** Cells along x and z. Cell (gx, gz) sits at (gx · spacingX, gz · spacingZ). */
  cols: number;
  rows: number;
  spacingX: number;
  spacingZ?: number;
  materials: readonly GranularMaterial[];
  /** Bedrock height per cell, row-major (`gz * cols + gx`), m. Default 0. */
  bed?: ArrayLike<number>;
  /** Loose depth per cell as poured, m. Default 0. */
  depth?: ArrayLike<number>;
  /** Material index per cell. Default 0. */
  material?: ArrayLike<number>;
  gravity?: number;
  /** Courant number of the adaptive substep. Default 0.4. */
  courant?: number;
  /** Most substeps one {@link GranularLayer.step} takes; past it the flow runs slow rather than unstable. Default 48. */
  maxSubsteps?: number;
  /** Still substeps before a cell sleeps. Default 12. */
  sleepSteps?: number;
  /** Start with every cell awake, so an unstable initial ground relaxes. Default true. */
  startAwake?: boolean;
}

/** What one {@link GranularLayer.step} did. */
export interface GranularStepReport {
  substeps: number;
  /** Simulated seconds; less than asked when the substep budget ran out. */
  simulated: number;
  /** Awake cells after the step. */
  awake: number;
  /** Solid volume that crossed a face, m³. */
  moved: number;
}

/** What a load did to the ground. */
export interface GranularPressReport {
  /** Mean sinkage over the footprint, m. */
  sinkage: number;
  /** Footprint cells. */
  cells: number;
  /** Solid volume pushed into the berm, m³. */
  displaced: number;
}

/** Plain JSON of a {@link GranularLayer}. */
export interface GranularLayerSnapshot {
  cols: number;
  rows: number;
  bed: number[];
  solid: number[];
  packing: number[];
  preload: number[];
  material: number[];
  ux: number[];
  uz: number[];
  awake: number[];
  idle: number[];
}

/** A granular layer. Cell arrays are row-major, `gz * cols + gx`. */
export interface GranularLayer {
  readonly cols: number;
  readonly rows: number;
  readonly spacingX: number;
  readonly spacingZ: number;
  readonly bed: Float64Array;
  /** Solid volume per unit area, m: loose depth × packing. */
  readonly solid: Float64Array;
  readonly packing: Float64Array;
  /** Largest pressure each cell has carried, Pa. */
  readonly preload: Float64Array;
  readonly material: Uint8Array;
  materials: readonly GranularMaterial[];
  index(gx: number, gz: number): number;
  /** Loose depth of a cell, m. */
  depth(cell: number): number;
  /** Bed plus loose depth, m. */
  surface(cell: number): number;
  /** Flow velocity at a cell, m/s along x and z: the mean of its faces. Zero where the ground is still. */
  velocity(cell: number): [number, number];
  awakeCount(): number;
  step(dt: number): GranularStepReport;
  /** Wake every cell within `radius` m of (x, z) so it re-checks its stability. */
  wake(x: number, z: number, radius: number): void;
  /** Scoop a bowl up to `depth` m deep and `radius` m wide. Returns the solid volume taken, m³. */
  dig(x: number, z: number, radius: number, depth: number): number;
  /** Pour `volume` m³ of solid as a mound `radius` m wide. Returns the volume placed. */
  deposit(x: number, z: number, radius: number, volume: number, material?: number): number;
  /** A flat round load of `load` N, `radius` m: a foot, a crate, a hoof. */
  press(x: number, z: number, radius: number, load: number): GranularPressReport;
  /** A rigid wheel of `diameter` and `width` m carrying `load` N rolled from (x0, z0) to (x1, z1). */
  roll(x0: number, z0: number, x1: number, z1: number, width: number, diameter: number, load: number): GranularPressReport;
  /** Cells whose surface changed since the last call, each once. */
  drainChanges(): number[];
  totalSolid(): number;
  snapshot(): GranularLayerSnapshot;
  restore(snapshot: GranularLayerSnapshot): void;
  /** Back to the ground it was created with. */
  reset(): void;
}

const MIN_DEPTH = 1e-5;

/**
 * Create a granular layer over a bedrock grid.
 * @capability granular-flow sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield
 */
export function createGranularLayer(config: GranularLayerConfig): GranularLayer {
  const cols = Math.max(1, Math.floor(config.cols));
  const rows = Math.max(1, Math.floor(config.rows));
  const sx = config.spacingX;
  const sz = config.spacingZ ?? sx;
  const area = sx * sz;
  const cells = cols * rows;
  const g = config.gravity ?? 9.81;
  const courant = config.courant ?? 0.4;
  const maxSubsteps = config.maxSubsteps ?? 48;
  const sleepSteps = config.sleepSteps ?? 12;
  let materials = config.materials;

  const bed = new Float64Array(cells);
  const solid = new Float64Array(cells);
  const packing = new Float64Array(cells);
  const preload = new Float64Array(cells);
  const material = new Uint8Array(cells);
  const xFaces = Math.max(0, cols - 1) * rows;
  const zFaces = cols * Math.max(0, rows - 1);
  const ux = new Float64Array(xFaces);
  const uz = new Float64Array(zFaces);
  const nextUx = new Float64Array(xFaces);
  const nextUz = new Float64Array(zFaces);
  const fluxX = new Float64Array(xFaces);
  const fluxZ = new Float64Array(zFaces);
  const stampX = new Uint32Array(xFaces);
  const stampZ = new Uint32Array(zFaces);
  const listX = new Int32Array(xFaces);
  const listZ = new Int32Array(zFaces);
  const awake = new Uint8Array(cells);
  const idle = new Uint16Array(cells);
  let awakeList = new Int32Array(cells);
  let awakeLength = 0;
  const outflow = new Float64Array(cells);
  const outStamp = new Uint32Array(cells);
  const changed = new Uint8Array(cells);
  const changedList: number[] = [];
  let stamp = 0;
  let maxWave = 0;

  function mat(cell: number): GranularMaterial {
    const m = materials[material[cell] ?? 0] ?? materials[0];
    if (m === undefined) throw new Error("createGranularLayer: no materials");
    return m;
  }

  function loosePacking(cell: number): number {
    return mat(cell).loosePacking;
  }

  function depth(cell: number): number {
    const s = solid[cell] ?? 0;
    return s > 0 ? s / (packing[cell] ?? 1) : 0;
  }

  function surface(cell: number): number {
    return (bed[cell] ?? 0) + depth(cell);
  }

  function markChanged(cell: number): void {
    if (changed[cell] === 1) return;
    changed[cell] = 1;
    changedList.push(cell);
  }

  function wakeCell(cell: number): void {
    idle[cell] = 0;
    if (awake[cell] === 1) return;
    awake[cell] = 1;
    awakeList[awakeLength] = cell;
    awakeLength += 1;
  }

  function load(): void {
    for (let i = 0; i < cells; i += 1) {
      bed[i] = config.bed?.[i] ?? 0;
      material[i] = config.material?.[i] ?? 0;
      packing[i] = loosePacking(i);
      solid[i] = Math.max(0, config.depth?.[i] ?? 0) * (packing[i] ?? 0);
      preload[i] = 0;
      awake[i] = 0;
      idle[i] = 0;
    }
    ux.fill(0);
    uz.fill(0);
    awakeLength = 0;
    if (config.startAwake ?? true) for (let i = 0; i < cells; i += 1) wakeCell(i);
  }
  load();

  // Upwind cell of a face between `a` and `b` (b downstream of a along the axis) for velocity `u`.
  function upwind(a: number, b: number, u: number): number {
    if (u > 0) return a;
    if (u < 0) return b;
    return surface(a) >= surface(b) ? a : b;
  }

  // Loose depth that can cross the face: the upwind column above the higher of the two beds.
  function faceDepth(a: number, b: number, up: number): number {
    const top = surface(up);
    const floor = Math.max(bed[a] ?? 0, bed[b] ?? 0);
    return top > floor ? Math.min(top - floor, depth(up)) : 0;
  }

  function gradZ(cell: number): number {
    const gz = Math.floor(cell / cols);
    const lo = gz > 0 ? cell - cols : cell;
    const hi = gz < rows - 1 ? cell + cols : cell;
    const span = (hi - lo) / cols;
    return span > 0 ? (surface(hi) - surface(lo)) / (span * sz) : 0;
  }

  function gradX(cell: number): number {
    const gx = cell % cols;
    const lo = gx > 0 ? cell - 1 : cell;
    const hi = gx < cols - 1 ? cell + 1 : cell;
    const span = hi - lo;
    return span > 0 ? (surface(hi) - surface(lo)) / (span * sx) : 0;
  }

  // Mean z velocity around the x face between a and b, from the four z faces touching it.
  function crossZ(a: number, b: number): number {
    let sum = 0;
    let n = 0;
    for (const c of [a, b]) {
      const gz = Math.floor(c / cols);
      const gx = c % cols;
      if (gz > 0) {
        sum += uz[(gz - 1) * cols + gx] ?? 0;
        n += 1;
      }
      if (gz < rows - 1) {
        sum += uz[gz * cols + gx] ?? 0;
        n += 1;
      }
    }
    return n > 0 ? sum / n : 0;
  }

  function crossX(a: number, b: number): number {
    let sum = 0;
    let n = 0;
    for (const c of [a, b]) {
      const gz = Math.floor(c / cols);
      const gx = c % cols;
      if (gx > 0) {
        sum += ux[gz * (cols - 1) + gx - 1] ?? 0;
        n += 1;
      }
      if (gx < cols - 1) {
        sum += ux[gz * (cols - 1) + gx] ?? 0;
        n += 1;
      }
    }
    return n > 0 ? sum / n : 0;
  }

  // New velocity along a face: `along` the current component, `across` the neighbours' mean of the other,
  // `drive` and `driveAcross` the gravity accelerations from the surface slope.
  function faceVelocity(a: number, b: number, along: number, across: number, drive: number, driveAcross: number, dt: number, span: number): number {
    const up = upwind(a, b, along !== 0 ? along : drive);
    const h = faceDepth(a, b, up);
    if (h < MIN_DEPTH) return 0;
    const m = mat(up);
    const bulk = m.grainDensity * (packing[up] ?? m.loosePacking);
    const cohesion = m.cohesion / (bulk * h);
    if (along === 0 && across === 0) {
      const slope = Math.hypot(drive, driveAcross) / g;
      const friction = startFriction(m, h);
      if (slope <= friction) return 0;
      // A cohesive bank steeper than friction holds up to Culmann's critical height for its slope angle.
      if (m.cohesion > 0 && Math.min(h, slope * span) <= culmannHeight(m.cohesion, bulk * g, Math.atan(slope), Math.atan(friction))) return 0;
    }
    const u = along + drive * dt;
    const v = across + driveAcross * dt;
    const speed = Math.hypot(u, v);
    if (speed === 0) return 0;
    // Implicit friction: the braked speed s solves s = speed − (g μ(h, s/√(gh)) + c/(ρh)) dt.
    const root = Math.sqrt(g * h);
    const residual = (s: number): number => s - speed + (g * flowFriction(m, h, s / root) + cohesion) * dt;
    if (residual(0) >= 0) return 0;
    // Fixed-point from the current speed converges in a few steps when friction varies slowly; bisect otherwise.
    let braked = Math.min(speed, Math.hypot(along, across));
    for (let k = 0; k < 3; k += 1) braked = Math.max(0, speed - (g * flowFriction(m, h, braked / root) + cohesion) * dt);
    if (Math.abs(residual(braked)) > 1e-4 * speed) {
      let lo = 0;
      let hi = speed;
      for (let k = 0; k < 16; k += 1) {
        const mid = 0.5 * (lo + hi);
        if (residual(mid) < 0) lo = mid;
        else hi = mid;
      }
      braked = 0.5 * (lo + hi);
    }
    const wave = braked + root;
    if (wave > maxWave) maxWave = wave;
    return (u * braked) / speed;
  }

  function addX(face: number): number {
    if (stampX[face] === stamp) return 0;
    stampX[face] = stamp;
    return 1;
  }

  function addZ(face: number): number {
    if (stampZ[face] === stamp) return 0;
    stampZ[face] = stamp;
    return 1;
  }

  function addOutflow(cell: number, amount: number): void {
    if (outStamp[cell] !== stamp) {
      outStamp[cell] = stamp;
      outflow[cell] = 0;
    }
    outflow[cell] = (outflow[cell] ?? 0) + amount;
  }

  function limit(cell: number): number {
    const out = outStamp[cell] === stamp ? (outflow[cell] ?? 0) : 0;
    const have = (solid[cell] ?? 0) * area;
    return out > have && out > 0 ? have / out : 1;
  }

  function receive(cell: number, amount: number, from: number): void {
    const before = solid[cell] ?? 0;
    const arriving = amount / area;
    if (before < MIN_DEPTH * 0.01 && arriving > before) material[cell] = material[from] ?? 0;
    const loose = loosePacking(cell);
    const looseDepth = before > 0 ? before / (packing[cell] ?? loose) : 0;
    solid[cell] = before + arriving;
    packing[cell] = (before + arriving) / (looseDepth + arriving / loose);
  }

  function substep(dt: number): number {
    stamp += 1;
    let nx = 0;
    let nz = 0;
    for (let k = 0; k < awakeLength; k += 1) {
      const c = awakeList[k] ?? 0;
      const gx = c % cols;
      const gz = Math.floor(c / cols);
      if (gx > 0 && addX(gz * (cols - 1) + gx - 1) === 1) listX[nx++] = gz * (cols - 1) + gx - 1;
      if (gx < cols - 1 && addX(gz * (cols - 1) + gx) === 1) listX[nx++] = gz * (cols - 1) + gx;
      if (gz > 0 && addZ((gz - 1) * cols + gx) === 1) listZ[nz++] = (gz - 1) * cols + gx;
      if (gz < rows - 1 && addZ(gz * cols + gx) === 1) listZ[nz++] = gz * cols + gx;
    }
    maxWave = 0;
    for (let k = 0; k < nx; k += 1) {
      const f = listX[k] ?? 0;
      const gz = Math.floor(f / (cols - 1));
      const a = gz * cols + (f % (cols - 1));
      const b = a + 1;
      const drive = (-g * (surface(b) - surface(a))) / sx;
      const driveAcross = -g * 0.5 * (gradZ(a) + gradZ(b));
      nextUx[f] = faceVelocity(a, b, ux[f] ?? 0, crossZ(a, b), drive, driveAcross, dt, sx);
    }
    for (let k = 0; k < nz; k += 1) {
      const f = listZ[k] ?? 0;
      const a = f;
      const b = f + cols;
      const drive = (-g * (surface(b) - surface(a))) / sz;
      const driveAcross = -g * 0.5 * (gradX(a) + gradX(b));
      nextUz[f] = faceVelocity(a, b, uz[f] ?? 0, crossX(a, b), drive, driveAcross, dt, sz);
    }
    // Solid volume each face carries, then scaled so no cell gives more than it holds.
    for (let k = 0; k < nx; k += 1) {
      const f = listX[k] ?? 0;
      const u = nextUx[f] ?? 0;
      ux[f] = u;
      fluxX[f] = 0;
      if (u === 0) continue;
      const gz = Math.floor(f / (cols - 1));
      const a = gz * cols + (f % (cols - 1));
      const up = u > 0 ? a : a + 1;
      const volume = Math.abs(u) * faceDepth(a, a + 1, up) * dt * sz * (packing[up] ?? 0);
      fluxX[f] = volume;
      addOutflow(up, volume);
    }
    for (let k = 0; k < nz; k += 1) {
      const f = listZ[k] ?? 0;
      const u = nextUz[f] ?? 0;
      uz[f] = u;
      fluxZ[f] = 0;
      if (u === 0) continue;
      const up = u > 0 ? f : f + cols;
      const volume = Math.abs(u) * faceDepth(f, f + cols, up) * dt * sx * (packing[up] ?? 0);
      fluxZ[f] = volume;
      addOutflow(up, volume);
    }
    // Fix every donor's limit before any transfer changes what it holds.
    for (let k = 0; k < nx; k += 1) {
      const f = listX[k] ?? 0;
      const u = ux[f] ?? 0;
      if (u !== 0) donorScale(Math.floor(f / (cols - 1)) * cols + (f % (cols - 1)) + (u > 0 ? 0 : 1));
    }
    for (let k = 0; k < nz; k += 1) {
      const f = listZ[k] ?? 0;
      const u = uz[f] ?? 0;
      if (u !== 0) donorScale(u > 0 ? f : f + cols);
    }
    let moved = 0;
    for (let k = 0; k < nx; k += 1) {
      const f = listX[k] ?? 0;
      const u = ux[f] ?? 0;
      if (u === 0) continue;
      const gz = Math.floor(f / (cols - 1));
      const a = gz * cols + (f % (cols - 1));
      moved += transfer(u > 0 ? a : a + 1, u > 0 ? a + 1 : a, fluxX[f] ?? 0);
    }
    for (let k = 0; k < nz; k += 1) {
      const f = listZ[k] ?? 0;
      const u = uz[f] ?? 0;
      if (u === 0) continue;
      moved += transfer(u > 0 ? f : f + cols, u > 0 ? f + cols : f, fluxZ[f] ?? 0);
    }
    // Sleep cells whose faces all stood still.
    let kept = 0;
    for (let k = 0; k < awakeLength; k += 1) {
      const c = awakeList[k] ?? 0;
      if (cellMoving(c)) idle[c] = 0;
      else idle[c] = (idle[c] ?? 0) + 1;
      if ((idle[c] ?? 0) > sleepSteps) awake[c] = 0;
      else awakeList[kept++] = c;
    }
    awakeLength = kept;
    return moved;
  }

  // Limits are taken before any transfer of this substep, so the result does not depend on face order.
  const scaleStamp = new Uint32Array(cells);
  const scale = new Float64Array(cells);
  function donorScale(cell: number): number {
    if (scaleStamp[cell] !== stamp) {
      scaleStamp[cell] = stamp;
      scale[cell] = limit(cell);
    }
    return scale[cell] ?? 1;
  }

  function transfer(from: number, to: number, volume: number): number {
    const amount = volume * donorScale(from);
    if (amount <= 0) return 0;
    solid[from] = Math.max(0, (solid[from] ?? 0) - amount / area);
    receive(to, amount, from);
    markChanged(from);
    markChanged(to);
    wakeCell(from);
    wakeCell(to);
    return amount;
  }

  function cellMoving(c: number): boolean {
    const gx = c % cols;
    const gz = Math.floor(c / cols);
    if (gx > 0 && (ux[gz * (cols - 1) + gx - 1] ?? 0) !== 0) return true;
    if (gx < cols - 1 && (ux[gz * (cols - 1) + gx] ?? 0) !== 0) return true;
    if (gz > 0 && (uz[(gz - 1) * cols + gx] ?? 0) !== 0) return true;
    if (gz < rows - 1 && (uz[gz * cols + gx] ?? 0) !== 0) return true;
    return false;
  }

  function forEachCell(x: number, z: number, reach: number, visit: (cell: number, gx: number, gz: number) => void): void {
    const x0 = Math.max(0, Math.floor((x - reach) / sx));
    const x1 = Math.min(cols - 1, Math.ceil((x + reach) / sx));
    const z0 = Math.max(0, Math.floor((z - reach) / sz));
    const z1 = Math.min(rows - 1, Math.ceil((z + reach) / sz));
    for (let gz = z0; gz <= z1; gz += 1) for (let gx = x0; gx <= x1; gx += 1) visit(gz * cols + gx, gx, gz);
  }

  function wake(x: number, z: number, radius: number): void {
    forEachCell(x, z, radius, (c) => wakeCell(c));
  }

  // Sink each footprint cell by the Bekker sinkage of `pressure` beyond what it already carried; what
  // compaction cannot take goes into the berm cells.
  function sink(footprint: readonly number[], berm: readonly number[], pressure: number, width: number): GranularPressReport {
    let sunk = 0;
    let displaced = 0;
    for (const c of footprint) {
      const soil = mat(c).bekker;
      const before = preload[c] ?? 0;
      if (soil === undefined || pressure <= before) continue;
      preload[c] = pressure;
      const h = depth(c);
      if (h <= 0) continue;
      const want = Math.min(h, plateSinkage(soil, pressure, width) - plateSinkage(soil, before, width));
      const s = solid[c] ?? 0;
      const dense = s / mat(c).densePacking;
      const compact = Math.min(want, Math.max(0, h - dense));
      const after = h - compact;
      packing[c] = after > 0 ? s / after : mat(c).densePacking;
      const push = Math.min(want - compact, after);
      if (push > 0) {
        const taken = push * (packing[c] ?? 0);
        solid[c] = s - taken;
        displaced += taken * area;
      }
      sunk += compact + push;
      markChanged(c);
    }
    if (displaced > 0) {
      if (berm.length === 0) {
        // No room around the load: the material stays where it was.
        const back = displaced / footprint.length;
        for (const c of footprint) receive(c, back, c);
      } else {
        const share = displaced / berm.length;
        for (const c of berm) {
          receive(c, share, footprint[0] ?? c);
          markChanged(c);
        }
      }
    }
    for (const c of footprint) wakeCell(c);
    for (const c of berm) wakeCell(c);
    return { sinkage: footprint.length > 0 ? sunk / footprint.length : 0, cells: footprint.length, displaced };
  }

  function dominantSoil(x: number, z: number) {
    const gx = Math.min(cols - 1, Math.max(0, Math.round(x / sx)));
    const gz = Math.min(rows - 1, Math.max(0, Math.round(z / sz)));
    return mat(gz * cols + gx).bekker;
  }

  const layer: GranularLayer = {
    cols,
    rows,
    spacingX: sx,
    spacingZ: sz,
    bed,
    solid,
    packing,
    preload,
    material,
    get materials() {
      return materials;
    },
    set materials(next: readonly GranularMaterial[]) {
      materials = next;
      for (let i = 0; i < cells; i += 1) wakeCell(i);
    },
    index: (gx, gz) => gz * cols + gx,
    depth,
    surface,
    velocity(cell) {
      const gx = cell % cols;
      const gz = Math.floor(cell / cols);
      let x = 0;
      let nx = 0;
      if (gx > 0) {
        x += ux[gz * (cols - 1) + gx - 1] ?? 0;
        nx += 1;
      }
      if (gx < cols - 1) {
        x += ux[gz * (cols - 1) + gx] ?? 0;
        nx += 1;
      }
      let z = 0;
      let nz = 0;
      if (gz > 0) {
        z += uz[(gz - 1) * cols + gx] ?? 0;
        nz += 1;
      }
      if (gz < rows - 1) {
        z += uz[gz * cols + gx] ?? 0;
        nz += 1;
      }
      return [nx > 0 ? x / nx : 0, nz > 0 ? z / nz : 0];
    },
    awakeCount: () => awakeLength,
    step(dt) {
      let left = dt;
      let substeps = 0;
      let moved = 0;
      let wave = Math.max(maxWave, Math.sqrt(g * Math.min(sx, sz)));
      while (left > 1e-12 && substeps < maxSubsteps && awakeLength > 0) {
        const h = Math.min(left, (courant * Math.min(sx, sz)) / wave);
        moved += substep(h);
        left -= h;
        substeps += 1;
        wave = Math.max(maxWave, Math.sqrt(g * Math.min(sx, sz)));
      }
      return { substeps, simulated: awakeLength > 0 ? dt - left : dt, awake: awakeLength, moved };
    },
    wake,
    dig(x, z, radius, deep) {
      let taken = 0;
      forEachCell(x, z, radius, (c, gx, gz) => {
        const d = Math.hypot(gx * sx - x, gz * sz - z);
        if (d > radius) return;
        const h = depth(c);
        const cut = Math.min(h, deep * (1 - (d / radius) ** 2));
        if (cut <= 0) return;
        const amount = cut * (packing[c] ?? 0);
        solid[c] = Math.max(0, (solid[c] ?? 0) - amount);
        taken += amount * area;
        markChanged(c);
      });
      wake(x, z, radius + 2 * Math.max(sx, sz));
      return taken;
    },
    deposit(x, z, radius, volume, materialIndex) {
      const reach = Math.max(radius, 0.5 * Math.max(sx, sz));
      const targets: number[] = [];
      const weights: number[] = [];
      let total = 0;
      forEachCell(x, z, reach, (c, gx, gz) => {
        const d = Math.hypot(gx * sx - x, gz * sz - z);
        if (d > reach) return;
        const w = 1 - (d / (reach * 1.0001)) ** 2;
        targets.push(c);
        weights.push(w);
        total += w;
      });
      if (total <= 0 || volume <= 0) return 0;
      for (const [k, c] of targets.entries()) {
        if (materialIndex !== undefined && (solid[c] ?? 0) <= MIN_DEPTH * 0.01) material[c] = materialIndex;
        receive(c, (volume * (weights[k] ?? 0)) / total, c);
        markChanged(c);
      }
      wake(x, z, reach + 2 * Math.max(sx, sz));
      return volume;
    },
    press(x, z, radius, force) {
      const footprint: number[] = [];
      const berm: number[] = [];
      const reach = Math.max(radius, 0.5 * Math.max(sx, sz));
      const rim = reach + Math.max(sx, sz, 0.5 * reach);
      forEachCell(x, z, rim, (c, gx, gz) => {
        const d = Math.hypot(gx * sx - x, gz * sz - z);
        if (d <= reach) footprint.push(c);
        else if (d <= rim) berm.push(c);
      });
      if (footprint.length === 0) return { sinkage: 0, cells: 0, displaced: 0 };
      return sink(footprint, berm, force / (Math.PI * radius * radius), radius);
    },
    roll(x0, z0, x1, z1, width, diameter, force) {
      const soil = dominantSoil(0.5 * (x0 + x1), 0.5 * (z0 + z1));
      if (soil === undefined) return { sinkage: 0, cells: 0, displaced: 0 };
      const pressure = plateSinkagePressure(soil, wheelSinkage(soil, force, width, diameter), width);
      const half = Math.max(0.5 * width, 0.5 * Math.max(sx, sz));
      const rim = half + Math.max(sx, sz, 0.5 * half);
      const dx = x1 - x0;
      const dz = z1 - z0;
      const length2 = dx * dx + dz * dz;
      const footprint: number[] = [];
      const berm: number[] = [];
      const cx = 0.5 * (x0 + x1);
      const cz = 0.5 * (z0 + z1);
      forEachCell(cx, cz, 0.5 * Math.sqrt(length2) + rim, (c, gx, gz) => {
        const px = gx * sx;
        const pz = gz * sz;
        const t = length2 > 0 ? Math.min(1, Math.max(0, ((px - x0) * dx + (pz - z0) * dz) / length2)) : 0;
        const d = Math.hypot(px - (x0 + t * dx), pz - (z0 + t * dz));
        if (d <= half) footprint.push(c);
        else if (d <= rim) berm.push(c);
      });
      return sink(footprint, berm, pressure, width);
    },
    drainChanges() {
      const out = changedList.slice();
      for (const c of changedList) changed[c] = 0;
      changedList.length = 0;
      return out;
    },
    totalSolid() {
      let sum = 0;
      for (let i = 0; i < cells; i += 1) sum += solid[i] ?? 0;
      return sum * area;
    },
    snapshot() {
      return {
        cols,
        rows,
        bed: Array.from(bed),
        solid: Array.from(solid),
        packing: Array.from(packing),
        preload: Array.from(preload),
        material: Array.from(material),
        ux: Array.from(ux),
        uz: Array.from(uz),
        awake: Array.from(awakeList.subarray(0, awakeLength)),
        idle: Array.from(idle),
      };
    },
    restore(snapshot) {
      if (snapshot.cols !== cols || snapshot.rows !== rows) throw new Error("GranularLayer.restore: grid size differs");
      bed.set(snapshot.bed);
      solid.set(snapshot.solid);
      packing.set(snapshot.packing);
      preload.set(snapshot.preload);
      material.set(snapshot.material);
      ux.set(snapshot.ux);
      uz.set(snapshot.uz);
      idle.set(snapshot.idle);
      awake.fill(0);
      awakeList = new Int32Array(cells);
      awakeLength = 0;
      for (const c of snapshot.awake) {
        awake[c] = 1;
        awakeList[awakeLength++] = c;
      }
      for (let i = 0; i < cells; i += 1) markChanged(i);
    },
    reset() {
      load();
      for (let i = 0; i < cells; i += 1) markChanged(i);
    },
  };
  return layer;
}
