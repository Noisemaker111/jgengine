// @skill jgengine-world
/**
 * Glacier velocity by the first-order Stokes equations of Blatter (1995) and Pattyn (2003): the
 * horizontal velocity (u, v) of ice of viscosity η satisfies
 *
 *   ∂x(2η(2u_x + v_y)) + ∂y(η(u_y + v_x)) + ∂z(η u_z) = ρg s_x
 *   ∂x(η(u_y + v_x)) + ∂y(2η(u_x + 2v_y)) + ∂z(η v_z) = ρg s_y
 *
 * with Glen's law η = ½ A^(−1/n) ε_e^((1−n)/n), ε_e² = u_x² + v_y² + u_x v_y + ¼(u_y + v_x)² + ¼u_z² + ¼v_z²,
 * a stress-free surface and a bed that either holds the ice (u = 0) or resists it by τ_b = β² u_b.
 * Unlike the shallow-ice approximation it keeps the lateral and longitudinal stresses, so ice walled
 * in by a valley feels its sides (Nye 1965; Harbor 1992), and ice over short bumps feels them.
 *
 * The equations are the stationary point of a convex functional (Dukowicz, Price & Lipscomb 2010),
 * discretised with trilinear finite elements on a terrain-following mesh: the plan grid's nodes, each
 * column split into `layers` even layers from bed to surface. Each Picard iteration freezes η,
 * assembles the symmetric positive definite system and solves it by conjugate gradients
 * preconditioned with symmetric block Gauss–Seidel over whole columns, each column solved exactly.
 * Either plan axis may be periodic (as in ISMIP-HOM, Pattyn et al. 2008), with the geometry dropping
 * by a fixed height per period; a periodic axis of one node is a domain uniform along that axis, the
 * valley cross-section of Nye (1965) and Harbor (1992). Columns thinner than `minThickness` hold
 * still. Only +, −, ×, ÷, √ and the engine's portable exp/log are used, so every JS engine gets the
 * same bits.
 *
 * @capability landform-glacial glaciers that flow, slide, carve their valleys wider and deeper and lay moraines
 */
import { plantPow } from "../../plants/growth/plantMath";
import { ICE_WEIGHT } from "./iceFlow";

/** A first-order Stokes grid: `cols` × `rows` plan nodes `dx` × `dy` metres apart, each column `layers` layers deep. */
export interface FirstOrderGrid {
  readonly cols: number;
  readonly rows: number;
  /** Node spacing along columns (x) in metres. */
  readonly dx: number;
  /** Node spacing along rows (y) in metres. Default `dx`. */
  readonly dy?: number;
  /** Element layers in each ice column. Default 10. */
  readonly layers?: number;
  /** Wrap the x axis: node `cols − 1` meets node 0. Default false. */
  readonly periodicX?: boolean;
  /** Wrap the y axis. Default false. */
  readonly periodicY?: boolean;
}

/** Ice geometry and rheology for one solve. */
export interface FirstOrderInput {
  /** Bed elevation per plan node in metres, row-major (index `row * cols + col`). */
  readonly bed: ArrayLike<number>;
  /** Ice thickness per plan node in metres. */
  readonly thickness: ArrayLike<number>;
  /**
   * Basal friction β² in Pa·a/m per unit area of bed, per plan node, or one value for all;
   * `Infinity` freezes the ice to its bed. Default frozen.
   */
  readonly friction?: ArrayLike<number> | number;
  /** Glen's rate factor A in Pa⁻ⁿ a⁻¹. */
  readonly rateFactor: number;
  /** Glen's exponent n. Default 3. */
  readonly glenExponent?: number;
  /** Height the geometry gains crossing the periodic x seam from the last node to the first, in metres (−L·tan α for a slope α down x). Default 0. */
  readonly dropX?: number;
  /** Height gained crossing the periodic y seam. Default 0. */
  readonly dropY?: number;
}

/** How hard to solve. */
export interface FirstOrderOptions {
  /** Relative change of velocity between Picard iterations that counts as converged. Default 1e-5. */
  readonly tolerance?: number;
  /** Most Picard iterations. Default 60. */
  readonly maxIterations?: number;
  /** Relative residual of the linear solves near convergence; early solves stop sooner. Default 1e-8. */
  readonly linearTolerance?: number;
  /** Relative velocity change below which Picard iterations give way to Newton's. Default 0.3; 0 keeps Picard. */
  readonly newtonBelow?: number;
  /** Most conjugate-gradient iterations per linear solve. Default 600. */
  readonly maxLinearIterations?: number;
  /** Strain rate in a⁻¹ added to the effective strain rate so η stays finite in still ice. Default 1e-8. */
  readonly strainFloor?: number;
  /** Columns thinner than this, in metres, do not move. Default 1. */
  readonly minThickness?: number;
  /** Start from zero instead of the last solve's velocity. Default false. */
  readonly cold?: boolean;
}

/** What one solve did. */
export interface FirstOrderReport {
  readonly iterations: number;
  readonly linearIterations: number;
  /** Relative velocity change at the last Picard iteration. */
  readonly change: number;
  readonly converged: boolean;
}

/** A reusable first-order Stokes solver for one grid. */
export interface FirstOrderIceFlow {
  readonly cols: number;
  readonly rows: number;
  /** Nodes per column, `layers + 1`, bed first. */
  readonly levels: number;
  /** Velocity along x in m/a per node, index `(row * cols + col) * levels + level`. */
  readonly u: Float64Array;
  /** Velocity along y in m/a per node. */
  readonly v: Float64Array;
  /** Solve for the velocity of `input`'s ice, starting from the last answer. */
  solve(input: FirstOrderInput, options?: FirstOrderOptions): FirstOrderReport;
  /** Surface speed in m/a of each plan node. */
  surfaceSpeed(out?: Float64Array): Float64Array;
  /** Speed of the ice over its bed in m/a per plan node, the vertical part included; `bed` is the last solve's. */
  slidingSpeed(bed: ArrayLike<number>, out?: Float64Array): Float64Array;
  /** Depth-averaged velocity per plan node in m/a, x then y components. */
  meanVelocity(outX?: Float64Array, outY?: Float64Array): [Float64Array, Float64Array];
  /** Forget the last velocity. */
  reset(): void;
}

const GAUSS_LO = 0.5 - 0.5 / Math.sqrt(3);
const GAUSS_HI = 0.5 + 0.5 / Math.sqrt(3);
const SLOTS = 27;
const CENTRE = 13;

// Trilinear shape functions of the unit cube's corners a = ai + 2aj + 4ak at the 2×2×2 Gauss points.
const shape = new Float64Array(64);
const shapeX = new Float64Array(64);
const shapeY = new Float64Array(64);
const shapeZ = new Float64Array(64);
// Bilinear shape functions of a face's corners a = ai + 2aj at the 2×2 Gauss points.
const face = new Float64Array(16);
const faceX = new Float64Array(16);
const faceY = new Float64Array(16);
{
  const points = [GAUSS_LO, GAUSS_HI];
  for (let g = 0; g < 8; g += 1) {
    const xi = points[g & 1] ?? 0;
    const et = points[(g >> 1) & 1] ?? 0;
    const ze = points[(g >> 2) & 1] ?? 0;
    for (let a = 0; a < 8; a += 1) {
      const fx = a & 1 ? xi : 1 - xi;
      const fy = (a >> 1) & 1 ? et : 1 - et;
      const fz = (a >> 2) & 1 ? ze : 1 - ze;
      const sx = a & 1 ? 1 : -1;
      const sy = (a >> 1) & 1 ? 1 : -1;
      const sz = (a >> 2) & 1 ? 1 : -1;
      shape[g * 8 + a] = fx * fy * fz;
      shapeX[g * 8 + a] = sx * fy * fz;
      shapeY[g * 8 + a] = fx * sy * fz;
      shapeZ[g * 8 + a] = fx * fy * sz;
    }
  }
  for (let g = 0; g < 4; g += 1) {
    const xi = points[g & 1] ?? 0;
    const et = points[(g >> 1) & 1] ?? 0;
    for (let a = 0; a < 4; a += 1) {
      const fx = a & 1 ? xi : 1 - xi;
      const fy = (a >> 1) & 1 ? et : 1 - et;
      face[g * 4 + a] = fx * fy;
      faceX[g * 4 + a] = (a & 1 ? 1 : -1) * fy;
      faceY[g * 4 + a] = fx * ((a >> 1) & 1 ? 1 : -1);
    }
  }
}

function at(values: ArrayLike<number> | number | undefined, i: number, fallback: number): number {
  if (values === undefined) return fallback;
  if (typeof values === "number") return values;
  return values[i] ?? fallback;
}

/**
 * A first-order (Blatter–Pattyn) Stokes ice-flow solver for a plan grid.
 * @capability landform-glacial glaciers that flow, slide, carve their valleys wider and deeper and lay moraines
 */
// stateless: velocity is a warm start for the next solve, not simulation state; reset() clears it.
export function createFirstOrderIceFlow(grid: FirstOrderGrid): FirstOrderIceFlow {
  const { cols, rows, dx } = grid;
  const dy = grid.dy ?? dx;
  const layers = grid.layers ?? 10;
  const periodicX = grid.periodicX ?? false;
  const periodicY = grid.periodicY ?? false;
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) throw new Error(`first-order grid needs whole positive sides, got ${cols}×${rows}`);
  if ((!periodicX && cols < 2) || (!periodicY && rows < 2)) throw new Error("a non-periodic first-order axis needs at least two nodes");
  if (!Number.isInteger(layers) || layers < 1) throw new Error(`first-order grid needs at least one layer, got ${layers}`);
  if (!(dx > 0) || !(dy > 0)) throw new Error("first-order grid spacing must be positive");
  const levels = layers + 1;
  const columns = cols * rows;
  const nodes = columns * levels;
  const u = new Float64Array(nodes);
  const v = new Float64Array(nodes);
  const prevU = new Float64Array(nodes);
  const prevV = new Float64Array(nodes);
  const stepU = new Float64Array(nodes);
  const stepV = new Float64Array(nodes);
  // Per node and stencil slot (dj, di, dk), the 2×2 block [uu, uv, vu, vv].
  const matrix = new Float64Array(nodes * SLOTS * 4);
  const neighbour = new Int32Array(nodes * SLOTS);
  const neighbourColumn = new Int32Array(nodes * SLOTS);
  const rhs = new Float64Array(2 * nodes);
  const fixed = new Uint8Array(nodes);
  // Conjugate-gradient work vectors over interleaved (u, v) unknowns.
  const x = new Float64Array(2 * nodes);
  const r = new Float64Array(2 * nodes);
  const z = new Float64Array(2 * nodes);
  const p = new Float64Array(2 * nodes);
  const q = new Float64Array(2 * nodes);
  // Column factors: inverted pivots and the blocks below and above each level.
  const pivot = new Float64Array(nodes * 4);
  const below = new Float64Array(nodes * 4);
  const above = new Float64Array(nodes * 4);
  const gather = new Float64Array(2 * levels);
  const thick = new Float64Array(columns);
  const beta = new Float64Array(columns);
  const active = new Int32Array(columns);
  let activeCount = 0;
  let lastDropX = 0;
  let lastDropY = 0;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      for (let k = 0; k < levels; k += 1) {
        const n = (row * cols + col) * levels + k;
        for (let s = 0; s < SLOTS; s += 1) {
          const dj = Math.floor(s / 9) - 1;
          const di = (Math.floor(s / 3) % 3) - 1;
          const dk = (s % 3) - 1;
          let c = col + di;
          let rr = row + dj;
          const kk = k + dk;
          if (periodicX) c = (c + cols) % cols;
          if (periodicY) rr = (rr + rows) % rows;
          const outside = c < 0 || c >= cols || rr < 0 || rr >= rows || kk < 0 || kk >= levels;
          neighbour[n * SLOTS + s] = outside ? -1 : (rr * cols + c) * levels + kk;
          neighbourColumn[n * SLOTS + s] = outside ? -1 : rr * cols + c;
        }
      }
    }
  }

  // Per node, the stencil slots that reach an earlier column and a later one, as start offsets into flat lists.
  const earlierStart = new Int32Array(nodes + 1);
  const laterStart = new Int32Array(nodes + 1);
  let earlierCount = 0;
  let laterCount = 0;
  for (let node = 0; node < nodes; node += 1) {
    const c = Math.floor(node / levels);
    for (let s = 0; s < SLOTS; s += 1) {
      const nc = neighbourColumn[node * SLOTS + s] ?? -1;
      if (nc < 0 || nc === c) continue;
      if (nc < c) earlierCount += 1;
      else laterCount += 1;
    }
    earlierStart[node + 1] = earlierCount;
    laterStart[node + 1] = laterCount;
  }
  const earlier = new Int32Array(earlierCount);
  const later = new Int32Array(laterCount);
  for (let node = 0; node < nodes; node += 1) {
    const c = Math.floor(node / levels);
    let e = earlierStart[node] ?? 0;
    let l = laterStart[node] ?? 0;
    for (let s = 0; s < SLOTS; s += 1) {
      const nc = neighbourColumn[node * SLOTS + s] ?? -1;
      if (nc < 0 || nc === c) continue;
      if (nc < c) {
        earlier[e] = node * SLOTS + s;
        e += 1;
      } else {
        later[l] = node * SLOTS + s;
        l += 1;
      }
    }
  }

  const ex = periodicX ? cols : cols - 1;
  const ey = periodicY ? rows : rows - 1;
  // Per element: corner nodes, corner heights and the frozen viscosity's inputs.
  const cornerNode = new Int32Array(8);
  const cornerZ = new Float64Array(8);
  const gx = new Float64Array(8);
  const gy = new Float64Array(8);
  const gz = new Float64Array(8);
  const corner = new Float64Array(4);
  const colIndex = new Int32Array(4);
  const shift = new Float64Array(4);
  // One element's 16×16 matrix (row 2b + component, column 2a + component) and load.
  const ke = new Float64Array(256);
  const fe = new Float64Array(16);
  const testU = new Float64Array(8);
  const testV = new Float64Array(8);

  function add(n: number, slot: number, uu: number, uv: number, vu: number, vv: number): void {
    const o = (n * SLOTS + slot) * 4;
    matrix[o] = (matrix[o] ?? 0) + uu;
    matrix[o + 1] = (matrix[o + 1] ?? 0) + uv;
    matrix[o + 2] = (matrix[o + 2] ?? 0) + vu;
    matrix[o + 3] = (matrix[o + 3] ?? 0) + vv;
  }

  // Set colIndex, shift and the surface corners of plan element (ei, ej); false when no corner has ice.
  function plan(ei: number, ej: number, bed: ArrayLike<number>, dropX: number, dropY: number): boolean {
    // The four columns of this element, with their heights unwrapped across a periodic seam.
    let anyIce = false;
    for (let a = 0; a < 4; a += 1) {
      const ci = ei + (a & 1);
      const cj = ej + (a >> 1);
      const wi = ci >= cols ? ci - cols : ci;
      const wj = cj >= rows ? cj - rows : cj;
      colIndex[a] = wj * cols + wi;
      shift[a] = (ci >= cols ? dropX : 0) + (cj >= rows ? dropY : 0);
      if ((thick[wj * cols + wi] ?? 0) > 0) anyIce = true;
    }
    if (!anyIce) return false;
    // Surface slope over the element's plan face (bilinear), the same at every level. A bare
    // corner whose rock stands above the ice beside it takes the ice's mean surface, so a valley
    // wall does not push the glacier sideways (the hybrid margin gradient of CISM, Lipscomb et al. 2019).
    let iceTop = 0;
    let icy = 0;
    for (let a = 0; a < 4; a += 1) {
      const c = colIndex[a] ?? 0;
      const h = thick[c] ?? 0;
      corner[a] = (bed[c] ?? 0) + h + (shift[a] ?? 0);
      if (h > 0) {
        iceTop += corner[a] ?? 0;
        icy += 1;
      }
    }
    iceTop /= icy;
    for (let a = 0; a < 4; a += 1) if ((thick[colIndex[a] ?? 0] ?? 0) <= 0 && (corner[a] ?? 0) > iceTop) corner[a] = iceTop;
    return true;
  }

  function layerNodes(ek: number, bed: ArrayLike<number>): void {
    for (let a = 0; a < 8; a += 1) {
      const c = colIndex[a & 3] ?? 0;
      const level = ek + (a >> 2);
      cornerNode[a] = c * levels + level;
      cornerZ[a] = (bed[c] ?? 0) + (shift[a & 3] ?? 0) + ((thick[c] ?? 0) * level) / layers;
    }
  }

  // One element of layer ek over the plan element whose columns and seam shifts are in colIndex and shift,
  // its surface corners in `corner`: accumulate its matrix and load and scatter them.
  function element(ek: number, bed: ArrayLike<number>, n: number, hardness: number, power: number, floor2: number, guess: number, newton: boolean): void {
    const s0 = corner[0] ?? 0;
    const s1 = corner[1] ?? 0;
    const s2 = corner[2] ?? 0;
    const s3 = corner[3] ?? 0;
    layerNodes(ek, bed);
    ke.fill(0);
    fe.fill(0);
    for (let g = 0; g < 8; g += 1) {
      let zx = 0;
      let zy = 0;
      let zz = 0;
      for (let a = 0; a < 8; a += 1) {
        const za = cornerZ[a] ?? 0;
        zx += (shapeX[g * 8 + a] ?? 0) * za;
        zy += (shapeY[g * 8 + a] ?? 0) * za;
        zz += (shapeZ[g * 8 + a] ?? 0) * za;
      }
      if (!(zz > 1e-9)) continue;
      let ux = 0;
      let uy = 0;
      let uz = 0;
      let vx = 0;
      let vy = 0;
      let vz = 0;
      for (let a = 0; a < 8; a += 1) {
        const nz = (shapeZ[g * 8 + a] ?? 0) / zz;
        const nx = ((shapeX[g * 8 + a] ?? 0) - nz * zx) / dx;
        const ny = ((shapeY[g * 8 + a] ?? 0) - nz * zy) / dy;
        gx[a] = nx;
        gy[a] = ny;
        gz[a] = nz;
        const node = cornerNode[a] ?? 0;
        const ua = u[node] ?? 0;
        const va = v[node] ?? 0;
        ux += nx * ua;
        uy += ny * ua;
        uz += nz * ua;
        vx += nx * va;
        vy += ny * va;
        vz += nz * va;
      }
      const shear = uy + vx;
      const strain2 = guess > 0 ? guess * guess : ux * ux + vy * vy + ux * vy + 0.25 * shear * shear + 0.25 * (uz * uz + vz * vz);
      const eta = 0.5 * hardness * (n === 1 ? 1 : plantPow(strain2 + floor2, power));
      const volume = 0.125 * dx * dy * zz;
      const w = volume * eta;
      const xi = (g & 1) === 1 ? GAUSS_HI : GAUSS_LO;
      const et = ((g >> 1) & 1) === 1 ? GAUSS_HI : GAUSS_LO;
      const sx = ((1 - et) * (s1 - s0) + et * (s3 - s2)) / dx;
      const sy = ((1 - xi) * (s2 - s0) + xi * (s3 - s1)) / dy;
      const load = volume * ICE_WEIGHT;
      // Newton adds 2η'·DQ(u;φ_b)·DQ(u;φ_a), η' = dη/dQ, to Picard's matrix, and the same times 2Q(u) to the load.
      const curve = newton && n !== 1 ? (2 * volume * eta * power) / (strain2 + floor2) : 0;
      for (let b = 0; b < 8; b += 1) {
        const bx = gx[b] ?? 0;
        const by = gy[b] ?? 0;
        const bz = gz[b] ?? 0;
        const nShape = shape[g * 8 + b] ?? 0;
        const du = 2 * ux * bx + vy * bx + 0.5 * shear * by + 0.5 * uz * bz;
        const dv = 2 * vy * by + ux * by + 0.5 * shear * bx + 0.5 * vz * bz;
        fe[2 * b] = (fe[2 * b] ?? 0) - load * sx * nShape + curve * du * 2 * strain2;
        fe[2 * b + 1] = (fe[2 * b + 1] ?? 0) - load * sy * nShape + curve * dv * 2 * strain2;
        testU[b] = du;
        testV[b] = dv;
      }
      for (let b = 0; b < 8; b += 1) {
        const bx = gx[b] ?? 0;
        const by = gy[b] ?? 0;
        const bz = gz[b] ?? 0;
        const tu = curve * (testU[b] ?? 0);
        const tv = curve * (testV[b] ?? 0);
        const row = 32 * b;
        // The matrix is symmetric: build the blocks with a ≥ b and read the rest transposed.
        for (let a = b; a < 8; a += 1) {
          const ax = gx[a] ?? 0;
          const ay = gy[a] ?? 0;
          const az = gz[a] ?? 0;
          const au = testU[a] ?? 0;
          const av = testV[a] ?? 0;
          const o = row + 2 * a;
          ke[o] = (ke[o] ?? 0) + w * (4 * bx * ax + by * ay + bz * az) + tu * au;
          ke[o + 1] = (ke[o + 1] ?? 0) + w * (2 * bx * ay + by * ax) + tu * av;
          ke[o + 16] = (ke[o + 16] ?? 0) + w * (2 * by * ax + bx * ay) + tv * au;
          ke[o + 17] = (ke[o + 17] ?? 0) + w * (4 * by * ay + bx * ax + bz * az) + tv * av;
        }
      }
    }
    for (let b = 0; b < 8; b += 1) {
      const nb = cornerNode[b] ?? 0;
      if (fixed[nb] === 1) continue;
      rhs[2 * nb] = (rhs[2 * nb] ?? 0) + (fe[2 * b] ?? 0);
      rhs[2 * nb + 1] = (rhs[2 * nb + 1] ?? 0) + (fe[2 * b + 1] ?? 0);
      for (let a = 0; a < 8; a += 1) {
        const na = cornerNode[a] ?? 0;
        if (fixed[na] === 1) continue;
        const s = (((a >> 1) & 1) - ((b >> 1) & 1) + 1) * 9 + ((a & 1) - (b & 1) + 1) * 3 + ((a >> 2) - (b >> 2) + 1);
        if (a >= b) {
          const o = 32 * b + 2 * a;
          add(nb, s, ke[o] ?? 0, ke[o + 1] ?? 0, ke[o + 16] ?? 0, ke[o + 17] ?? 0);
        } else {
          const o = 32 * a + 2 * b;
          add(nb, s, ke[o] ?? 0, ke[o + 16] ?? 0, ke[o + 1] ?? 0, ke[o + 17] ?? 0);
        }
      }
    }
  }

  // The functional the velocity minimises (Dukowicz, Price & Lipscomb 2010): viscous dissipation
  // B(Q + ε₀²)^((n+1)/2n)·2n/(n+1), plus ρg ∇s·u, plus ½β²|u_b|² over the bed.
  function energy(input: FirstOrderInput, us: Float64Array, vs: Float64Array, n: number, hardness: number, power: number, floor2: number): number {
    const { bed } = input;
    const dropX = input.dropX ?? 0;
    const dropY = input.dropY ?? 0;
    const lift = power + 1;
    let total = 0;
    for (let ej = 0; ej < ey; ej += 1) {
      for (let ei = 0; ei < ex; ei += 1) {
        if (!plan(ei, ej, bed, dropX, dropY)) continue;
        const s0 = corner[0] ?? 0;
        const s1 = corner[1] ?? 0;
        const s2 = corner[2] ?? 0;
        const s3 = corner[3] ?? 0;
        for (let ek = 0; ek < layers; ek += 1) {
          layerNodes(ek, bed);
          for (let g = 0; g < 8; g += 1) {
            let zx = 0;
            let zy = 0;
            let zz = 0;
            for (let a = 0; a < 8; a += 1) {
              const za = cornerZ[a] ?? 0;
              zx += (shapeX[g * 8 + a] ?? 0) * za;
              zy += (shapeY[g * 8 + a] ?? 0) * za;
              zz += (shapeZ[g * 8 + a] ?? 0) * za;
            }
            if (!(zz > 1e-9)) continue;
            let ug = 0;
            let vg = 0;
            let ux = 0;
            let uy = 0;
            let uz = 0;
            let vx = 0;
            let vy = 0;
            let vz = 0;
            for (let a = 0; a < 8; a += 1) {
              const nz = (shapeZ[g * 8 + a] ?? 0) / zz;
              const nx = ((shapeX[g * 8 + a] ?? 0) - nz * zx) / dx;
              const ny = ((shapeY[g * 8 + a] ?? 0) - nz * zy) / dy;
              const node = cornerNode[a] ?? 0;
              const ua = us[node] ?? 0;
              const va = vs[node] ?? 0;
              const na = shape[g * 8 + a] ?? 0;
              ug += na * ua;
              vg += na * va;
              ux += nx * ua;
              uy += ny * ua;
              uz += nz * ua;
              vx += nx * va;
              vy += ny * va;
              vz += nz * va;
            }
            const shear = uy + vx;
            const strain2 = ux * ux + vy * vy + ux * vy + 0.25 * shear * shear + 0.25 * (uz * uz + vz * vz);
            const volume = 0.125 * dx * dy * zz;
            const xi = (g & 1) === 1 ? GAUSS_HI : GAUSS_LO;
            const et = ((g >> 1) & 1) === 1 ? GAUSS_HI : GAUSS_LO;
            const sx = ((1 - et) * (s1 - s0) + et * (s3 - s2)) / dx;
            const sy = ((1 - xi) * (s2 - s0) + xi * (s3 - s1)) / dy;
            const dissipation = n === 1 ? 0.5 * hardness * strain2 : (hardness * plantPow(strain2 + floor2, lift)) / lift;
            total += volume * (dissipation + ICE_WEIGHT * (sx * ug + sy * vg));
          }
        }
        const b0 = (bed[colIndex[0] ?? 0] ?? 0) + (shift[0] ?? 0);
        const b1 = (bed[colIndex[1] ?? 0] ?? 0) + (shift[1] ?? 0);
        const b2 = (bed[colIndex[2] ?? 0] ?? 0) + (shift[2] ?? 0);
        const b3 = (bed[colIndex[3] ?? 0] ?? 0) + (shift[3] ?? 0);
        for (let g = 0; g < 4; g += 1) {
          let friction = 0;
          let ub = 0;
          let vb = 0;
          for (let a = 0; a < 4; a += 1) {
            const c = colIndex[a] ?? 0;
            const na = face[g * 4 + a] ?? 0;
            friction += na * (beta[c] ?? 0);
            ub += na * (us[c * levels] ?? 0);
            vb += na * (vs[c * levels] ?? 0);
          }
          if (!(friction > 0)) continue;
          const xi = (g & 1) === 1 ? GAUSS_HI : GAUSS_LO;
          const et = ((g >> 1) & 1) === 1 ? GAUSS_HI : GAUSS_LO;
          const bx = ((1 - et) * (b1 - b0) + et * (b3 - b2)) / dx;
          const by = ((1 - xi) * (b2 - b0) + xi * (b3 - b1)) / dy;
          total += 0.125 * dx * dy * Math.sqrt(1 + bx * bx + by * by) * friction * (ub * ub + vb * vb);
        }
      }
    }
    return total;
  }

  function assemble(input: FirstOrderInput, n: number, hardness: number, power: number, floor2: number, guess: number, newton: boolean): void {
    matrix.fill(0);
    rhs.fill(0);
    const { bed } = input;
    const dropX = input.dropX ?? 0;
    const dropY = input.dropY ?? 0;
    for (let ej = 0; ej < ey; ej += 1) {
      for (let ei = 0; ei < ex; ei += 1) {
        if (!plan(ei, ej, bed, dropX, dropY)) continue;
        for (let ek = 0; ek < layers; ek += 1) element(ek, bed, n, hardness, power, floor2, guess, newton);
        // Basal friction on the element's bottom face, per unit area of the sloping bed.
        const b0 = (bed[colIndex[0] ?? 0] ?? 0) + (shift[0] ?? 0);
        const b1 = (bed[colIndex[1] ?? 0] ?? 0) + (shift[1] ?? 0);
        const b2 = (bed[colIndex[2] ?? 0] ?? 0) + (shift[2] ?? 0);
        const b3 = (bed[colIndex[3] ?? 0] ?? 0) + (shift[3] ?? 0);
        for (let g = 0; g < 4; g += 1) {
          let friction = 0;
          for (let a = 0; a < 4; a += 1) friction += (face[g * 4 + a] ?? 0) * (beta[colIndex[a] ?? 0] ?? 0);
          if (!(friction > 0)) continue;
          const xi = (g & 1) === 1 ? GAUSS_HI : GAUSS_LO;
          const et = ((g >> 1) & 1) === 1 ? GAUSS_HI : GAUSS_LO;
          const bx = ((1 - et) * (b1 - b0) + et * (b3 - b2)) / dx;
          const by = ((1 - xi) * (b2 - b0) + xi * (b3 - b1)) / dy;
          const w = 0.25 * dx * dy * Math.sqrt(1 + bx * bx + by * by) * friction;
          for (let b = 0; b < 4; b += 1) {
            const nb = (colIndex[b] ?? 0) * levels;
            if (fixed[nb] === 1) continue;
            for (let a = 0; a < 4; a += 1) {
              const na = (colIndex[a] ?? 0) * levels;
              if (fixed[na] === 1) continue;
              const s = (((a >> 1) & 1) - ((b >> 1) & 1) + 1) * 9 + ((a & 1) - (b & 1) + 1) * 3 + 1;
              const m = w * (face[g * 4 + a] ?? 0) * (face[g * 4 + b] ?? 0);
              add(nb, s, m, 0, 0, m);
            }
          }
        }
      }
    }
    for (let node = 0; node < nodes; node += 1) {
      if (fixed[node] === 1) {
        add(node, CENTRE, 1, 0, 0, 1);
        continue;
      }
      // A node no element reaches (ice beside a bare column on every side) keeps a unit diagonal.
      const o = (node * SLOTS + CENTRE) * 4;
      if ((matrix[o] ?? 0) === 0 && (matrix[o + 3] ?? 0) === 0) add(node, CENTRE, 1, 0, 0, 1);
    }
  }

  function multiply(input: Float64Array, output: Float64Array): void {
    for (let ai = 0; ai < activeCount; ai += 1) {
      const c = active[ai] ?? 0;
      for (let node = c * levels; node < (c + 1) * levels; node += 1) {
      let yu = 0;
      let yv = 0;
      const base = node * SLOTS;
      for (let s = 0; s < SLOTS; s += 1) {
        const nb = neighbour[base + s] ?? -1;
        if (nb < 0) continue;
        const o = (base + s) * 4;
        const xu = input[2 * nb] ?? 0;
        const xv = input[2 * nb + 1] ?? 0;
        yu += (matrix[o] ?? 0) * xu + (matrix[o + 1] ?? 0) * xv;
        yv += (matrix[o + 2] ?? 0) * xu + (matrix[o + 3] ?? 0) * xv;
      }
      output[2 * node] = yu;
      output[2 * node + 1] = yv;
      }
    }
  }

  // Factor every column's block-tridiagonal part: pivots P_k = D_k − L_k P_{k−1}⁻¹ U_{k−1}, inverted.
  function factorColumns(): void {
    for (let ai = 0; ai < activeCount; ai += 1) {
      const c = active[ai] ?? 0;
      for (let k = 0; k < levels; k += 1) {
        const node = c * levels + k;
        let d0 = 0;
        let d1 = 0;
        let d2 = 0;
        let d3 = 0;
        let l0 = 0;
        let l1 = 0;
        let l2 = 0;
        let l3 = 0;
        let a0 = 0;
        let a1 = 0;
        let a2 = 0;
        let a3 = 0;
        for (let s = 0; s < SLOTS; s += 1) {
          if ((neighbourColumn[node * SLOTS + s] ?? -1) !== c) continue;
          const o = (node * SLOTS + s) * 4;
          const dk = (s % 3) - 1;
          const m0 = matrix[o] ?? 0;
          const m1 = matrix[o + 1] ?? 0;
          const m2 = matrix[o + 2] ?? 0;
          const m3 = matrix[o + 3] ?? 0;
          if (dk === 0) {
            d0 += m0;
            d1 += m1;
            d2 += m2;
            d3 += m3;
          } else if (dk < 0) {
            l0 += m0;
            l1 += m1;
            l2 += m2;
            l3 += m3;
          } else {
            a0 += m0;
            a1 += m1;
            a2 += m2;
            a3 += m3;
          }
        }
        if (k > 0) {
          // D −= L · P⁻¹_{k−1} · U_{k−1}
          const pp = (node - 1) * 4;
          const p0 = pivot[pp] ?? 0;
          const p1 = pivot[pp + 1] ?? 0;
          const p2 = pivot[pp + 2] ?? 0;
          const p3 = pivot[pp + 3] ?? 0;
          const u0 = above[pp] ?? 0;
          const u1 = above[pp + 1] ?? 0;
          const u2 = above[pp + 2] ?? 0;
          const u3 = above[pp + 3] ?? 0;
          const t0 = p0 * u0 + p1 * u2;
          const t1 = p0 * u1 + p1 * u3;
          const t2 = p2 * u0 + p3 * u2;
          const t3 = p2 * u1 + p3 * u3;
          d0 -= l0 * t0 + l1 * t2;
          d1 -= l0 * t1 + l1 * t3;
          d2 -= l2 * t0 + l3 * t2;
          d3 -= l2 * t1 + l3 * t3;
        }
        const det = d0 * d3 - d1 * d2;
        const o = node * 4;
        pivot[o] = d3 / det;
        pivot[o + 1] = -d1 / det;
        pivot[o + 2] = -d2 / det;
        pivot[o + 3] = d0 / det;
        below[o] = l0;
        below[o + 1] = l1;
        below[o + 2] = l2;
        below[o + 3] = l3;
        above[o] = a0;
        above[o + 1] = a1;
        above[o + 2] = a2;
        above[o + 3] = a3;
      }
    }
  }

  // Solve column c's block-tridiagonal system in place on `gather` (2 values per level).
  function columnSolve(c: number): void {
    for (let k = 0; k < levels; k += 1) {
      const o = (c * levels + k) * 4;
      let g0 = gather[2 * k] ?? 0;
      let g1 = gather[2 * k + 1] ?? 0;
      if (k > 0) {
        const y0 = gather[2 * k - 2] ?? 0;
        const y1 = gather[2 * k - 1] ?? 0;
        g0 -= (below[o] ?? 0) * y0 + (below[o + 1] ?? 0) * y1;
        g1 -= (below[o + 2] ?? 0) * y0 + (below[o + 3] ?? 0) * y1;
      }
      gather[2 * k] = (pivot[o] ?? 0) * g0 + (pivot[o + 1] ?? 0) * g1;
      gather[2 * k + 1] = (pivot[o + 2] ?? 0) * g0 + (pivot[o + 3] ?? 0) * g1;
    }
    for (let k = levels - 2; k >= 0; k -= 1) {
      const o = (c * levels + k) * 4;
      const x0 = gather[2 * k + 2] ?? 0;
      const x1 = gather[2 * k + 3] ?? 0;
      const t0 = (above[o] ?? 0) * x0 + (above[o + 1] ?? 0) * x1;
      const t1 = (above[o + 2] ?? 0) * x0 + (above[o + 3] ?? 0) * x1;
      gather[2 * k] = (gather[2 * k] ?? 0) - ((pivot[o] ?? 0) * t0 + (pivot[o + 1] ?? 0) * t1);
      gather[2 * k + 1] = (gather[2 * k + 1] ?? 0) - ((pivot[o + 2] ?? 0) * t0 + (pivot[o + 3] ?? 0) * t1);
    }
  }

  // Off-column coupling of column c with the columns before (sign < 0) or after (sign > 0) it.
  function offColumn(c: number, vector: Float64Array, after: boolean): void {
    const start = after ? laterStart : earlierStart;
    const list = after ? later : earlier;
    for (let k = 0; k < levels; k += 1) {
      const node = c * levels + k;
      let su = 0;
      let sv = 0;
      const end = start[node + 1] ?? 0;
      for (let e = start[node] ?? 0; e < end; e += 1) {
        const slot = list[e] ?? 0;
        const nb = neighbour[slot] ?? 0;
        const o = slot * 4;
        const xu = vector[2 * nb] ?? 0;
        const xv = vector[2 * nb + 1] ?? 0;
        su += (matrix[o] ?? 0) * xu + (matrix[o + 1] ?? 0) * xv;
        sv += (matrix[o + 2] ?? 0) * xu + (matrix[o + 3] ?? 0) * xv;
      }
      gather[2 * k] = su;
      gather[2 * k + 1] = sv;
    }
  }

  // z = M⁻¹ r with M = (D + L) D⁻¹ (D + U), D the column blocks: symmetric block Gauss–Seidel.
  function precondition(): void {
    for (let ai = 0; ai < activeCount; ai += 1) {
      const c = active[ai] ?? 0;
      offColumn(c, z, false);
      for (let j = 0; j < 2 * levels; j += 1) gather[j] = (r[2 * c * levels + j] ?? 0) - (gather[j] ?? 0);
      columnSolve(c);
      for (let j = 0; j < 2 * levels; j += 1) z[2 * c * levels + j] = gather[j] ?? 0;
    }
    for (let ai = activeCount - 1; ai >= 0; ai -= 1) {
      const c = active[ai] ?? 0;
      offColumn(c, z, true);
      columnSolve(c);
      for (let j = 0; j < 2 * levels; j += 1) z[2 * c * levels + j] = (z[2 * c * levels + j] ?? 0) - (gather[j] ?? 0);
    }
  }

  function dot(a: Float64Array, b: Float64Array): number {
    let sum = 0;
    for (let ai = 0; ai < activeCount; ai += 1) {
      const c = active[ai] ?? 0;
      for (let i = 2 * c * levels; i < 2 * (c + 1) * levels; i += 1) sum += (a[i] ?? 0) * (b[i] ?? 0);
    }
    return sum;
  }

  // y += alpha·x over the active unknowns.
  function axpy(y: Float64Array, alpha: number, xs: Float64Array): void {
    for (let ai = 0; ai < activeCount; ai += 1) {
      const c = active[ai] ?? 0;
      for (let i = 2 * c * levels; i < 2 * (c + 1) * levels; i += 1) y[i] = (y[i] ?? 0) + alpha * (xs[i] ?? 0);
    }
  }

  function conjugateGradient(tolerance: number, limit: number): number {
    z.fill(0);
    factorColumns();
    for (let node = 0; node < nodes; node += 1) {
      x[2 * node] = u[node] ?? 0;
      x[2 * node + 1] = v[node] ?? 0;
    }
    multiply(x, q);
    r.set(rhs);
    axpy(r, -1, q);
    const norm = Math.sqrt(dot(rhs, rhs));
    const target = tolerance * (norm > 0 ? norm : 1);
    let iterations = 0;
    if (Math.sqrt(dot(r, r)) > target) {
      precondition();
      p.set(z);
      let rz = dot(r, z);
      for (; iterations < limit; iterations += 1) {
        multiply(p, q);
        const pq = dot(p, q);
        if (!(pq > 0)) break;
        const alpha = rz / pq;
        axpy(x, alpha, p);
        axpy(r, -alpha, q);
        if (Math.sqrt(dot(r, r)) <= target) {
          iterations += 1;
          break;
        }
        precondition();
        const next = dot(r, z);
        const ratio = next / rz;
        rz = next;
        for (let ai = 0; ai < activeCount; ai += 1) {
          const c = active[ai] ?? 0;
          for (let i = 2 * c * levels; i < 2 * (c + 1) * levels; i += 1) p[i] = (z[i] ?? 0) + ratio * (p[i] ?? 0);
        }
      }
    }
    for (let node = 0; node < nodes; node += 1) {
      u[node] = x[2 * node] ?? 0;
      v[node] = x[2 * node + 1] ?? 0;
    }
    return iterations;
  }

  return {
    cols,
    rows,
    levels,
    u,
    v,
    solve(input, options = {}) {
      const n = input.glenExponent ?? 3;
      lastDropX = input.dropX ?? 0;
      lastDropY = input.dropY ?? 0;
      const tolerance = options.tolerance ?? 1e-5;
      const maxIterations = options.maxIterations ?? 60;
      const floor = options.strainFloor ?? 1e-8;
      const minThickness = options.minThickness ?? 1;
      if (input.bed.length !== columns || input.thickness.length !== columns) throw new Error(`first-order input needs ${columns} bed and thickness values`);
      if (!(input.rateFactor > 0) || !(n > 0)) throw new Error("first-order flow needs a positive rate factor and Glen exponent");
      for (let c = 0; c < columns; c += 1) {
        const h = input.thickness[c] ?? 0;
        thick[c] = h >= minThickness ? h : 0;
        beta[c] = at(input.friction, c, Number.POSITIVE_INFINITY);
      }
      fixed.fill(0);
      activeCount = 0;
      for (let c = 0; c < columns; c += 1) {
        const bare = (thick[c] ?? 0) <= 0;
        if (!bare) {
          active[activeCount] = c;
          activeCount += 1;
        }
        const frozen = !((beta[c] ?? 0) < Number.POSITIVE_INFINITY);
        if (frozen) beta[c] = 0;
        for (let k = 0; k < levels; k += 1) if (bare || (frozen && k === 0)) fixed[c * levels + k] = 1;
      }
      if (options.cold === true) {
        u.fill(0);
        v.fill(0);
      }
      for (let node = 0; node < nodes; node += 1) {
        if (fixed[node] === 1) {
          u[node] = 0;
          v[node] = 0;
        }
      }
      const hardness = plantPow(input.rateFactor, -1 / n);
      const power = (1 - n) / (2 * n);
      let started = false;
      for (let node = 0; node < nodes && !started; node += 1) started = (u[node] ?? 0) !== 0 || (v[node] ?? 0) !== 0;
      let change = Number.POSITIVE_INFINITY;
      let linear = 0;
      let iterations = 0;
      const newtonBelow = options.newtonBelow ?? 0.3;
      const linearTolerance = options.linearTolerance ?? 1e-8;
      let newtonOn = false;
      while (iterations < maxIterations) {
        prevU.set(u);
        prevV.set(v);
        // Picard until close, then Newton; a Newton step that changes the velocity by more than its size sends it back to Picard.
        if (change < newtonBelow) newtonOn = true;
        else if (change > 1) newtonOn = false;
        const newton = started && newtonOn;
        // From rest, the first viscosity comes from a typical glacier strain rate of 0.01 a⁻¹.
        assemble(input, n, hardness, power, floor * floor, started ? 0 : 0.01, newton);
        started = true;
        // Far from the answer a rough linear solve is enough (inexact Newton, Eisenstat & Walker 1996).
        const forcing = 0.01 * change;
        linear += conjugateGradient(forcing < linearTolerance ? linearTolerance : forcing > 1e-3 ? 1e-3 : forcing, options.maxLinearIterations ?? 600);
        iterations += 1;
        if (newton) {
          // Backtrack along the Newton step until the functional falls (Armijo-style, halving).
          const before = energy(input, prevU, prevV, n, hardness, power, floor * floor);
          for (let node = 0; node < nodes; node += 1) {
            stepU[node] = (u[node] ?? 0) - (prevU[node] ?? 0);
            stepV[node] = (v[node] ?? 0) - (prevV[node] ?? 0);
          }
          let step = 1;
          for (let tries = 0; tries < 8; tries += 1) {
            if (energy(input, u, v, n, hardness, power, floor * floor) <= before) break;
            step *= 0.5;
            for (let node = 0; node < nodes; node += 1) {
              u[node] = (prevU[node] ?? 0) + step * (stepU[node] ?? 0);
              v[node] = (prevV[node] ?? 0) + step * (stepV[node] ?? 0);
            }
          }
        }
        let diff = 0;
        let size = 0;
        for (let node = 0; node < nodes; node += 1) {
          const du = (u[node] ?? 0) - (prevU[node] ?? 0);
          const dv = (v[node] ?? 0) - (prevV[node] ?? 0);
          diff += du * du + dv * dv;
          size += (u[node] ?? 0) * (u[node] ?? 0) + (v[node] ?? 0) * (v[node] ?? 0);
        }
        change = size > 0 ? Math.sqrt(diff / size) : 0;
        if (change < tolerance) break;
      }
      return { iterations, linearIterations: linear, change, converged: change < tolerance };
    },
    surfaceSpeed(out = new Float64Array(columns)) {
      for (let c = 0; c < columns; c += 1) {
        const node = c * levels + layers;
        const a = u[node] ?? 0;
        const b = v[node] ?? 0;
        out[c] = Math.sqrt(a * a + b * b);
      }
      return out;
    },
    slidingSpeed(bed, out = new Float64Array(columns)) {
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const c = row * cols + col;
          const node = c * levels;
          const a = u[node] ?? 0;
          const b = v[node] ?? 0;
          // The bed's slope by centred differences (one-sided at a non-periodic edge, across the seam's drop
          // on a periodic one) carries the vertical part w = u·∇b.
          const here = bed[c] ?? 0;
          let east = here;
          let west = here;
          let spanX = 0;
          if (col + 1 < cols || periodicX) {
            east = col + 1 < cols ? (bed[c + 1] ?? 0) : (bed[c + 1 - cols] ?? 0) + lastDropX;
            spanX += 1;
          }
          if (col > 0 || periodicX) {
            west = col > 0 ? (bed[c - 1] ?? 0) : (bed[c - 1 + cols] ?? 0) - lastDropX;
            spanX += 1;
          }
          let south = here;
          let north = here;
          let spanY = 0;
          if (row + 1 < rows || periodicY) {
            south = row + 1 < rows ? (bed[c + cols] ?? 0) : (bed[c + cols - columns] ?? 0) + lastDropY;
            spanY += 1;
          }
          if (row > 0 || periodicY) {
            north = row > 0 ? (bed[c - cols] ?? 0) : (bed[c - cols + columns] ?? 0) - lastDropY;
            spanY += 1;
          }
          const bx = spanX > 0 ? (east - west) / (spanX * dx) : 0;
          const by = spanY > 0 ? (south - north) / (spanY * dy) : 0;
          const w = a * bx + b * by;
          out[c] = Math.sqrt(a * a + b * b + w * w);
        }
      }
      return out;
    },
    meanVelocity(outX = new Float64Array(columns), outY = new Float64Array(columns)) {
      for (let c = 0; c < columns; c += 1) {
        let sx = 0;
        let sy = 0;
        for (let k = 0; k < levels; k += 1) {
          const weight = k === 0 || k === layers ? 0.5 : 1;
          sx += weight * (u[c * levels + k] ?? 0);
          sy += weight * (v[c * levels + k] ?? 0);
        }
        outX[c] = sx / layers;
        outY[c] = sy / layers;
      }
      return [outX, outY];
    },
    reset() {
      u.fill(0);
      v.fill(0);
    },
  };
}
