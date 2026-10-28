// @skill jgengine-world
/**
 * Valley glaciers by the shallow-ice approximation: ice thickness H over a bed b flows down its own
 * surface s = b + H by Glen's law (Glen 1955, n = 3) and slides over its bed at u_b = C·τ_b, with
 * τ_b = ρgH|∇s|, so the flux is q = −(Γ H⁵ |∇s|² + C ρg H²) ∇s, Γ = 2A(ρg)³/5. Ice gains and loses
 * mass by a balance that rises with altitude, b = min(β(s − ELA), b_max). Fluxes live on the cell
 * faces of Mahaffy's (1976) staggered grid, with a face's thickness capped at its upper cell's so
 * a thin or bare cell above cannot be drained (Jarosch, Schoof & Anslow 2013 show why this matters on steep beds).
 *
 * Steep valley walls make the equation far too stiff for explicit steps (Hindmarsh & Payne 1996),
 * and a linearised implicit step on a 100 m grid of real mountains oscillates without settling. So
 * each step is fully implicit (backward Euler) and solved by Newton's method, with H ≥ 0 kept by a
 * reduced-space active set, as Jouvet & Bueler (2012) solve glaciers as an obstacle problem: a bare
 * cell whose balance would take ice away stays bare, any other cell joins the solve. The Newton
 * systems are solved by BiCGSTAB (van der Vorst 1992) preconditioned with incomplete LU. A step that
 * does not converge is halved, and a step that does lets the next one double up to `maxStep`, so
 * the ice runs in real time and settles to the exact steady state of the scheme (Vialov's 1958 ice
 * sheet on a flat bed).
 *
 * Sliding is what erodes: the bed lowers at K_g·u_b (Harbor 1992; Braun, Zwartz & Tomkin 1999).
 * Neighbouring columns shear each other where their ice meets, and rock holds the ice still where
 * a neighbour's bed rises beside it, so ice in the bottom of a V slides slower than ice on its
 * flanks, the corner effect behind Harbor's (1992) widening of V-shaped valleys. This stand-in
 * resolves it only roughly; the first-order solver (`firstOrderIceFlow`) resolves the walls' drag.
 *
 * @capability landform-glacial glaciers that flow, slide, carve their valleys wider and deeper and lay moraines
 */
import type { LandformTopology } from "../grid/landformGrid";

const DRAG_PASSES = 40;
const NEWTON_ITERATIONS = 12;
const LINEAR_ITERATIONS = 200;
const LINEAR_TOLERANCE = 1e-6;
const SHORTEST_STEP = 1 / 16;

/** Weight of ice per unit volume, ρg in Pa/m (910 kg/m³ × 9.81 m/s²). */
export const ICE_WEIGHT = 910 * 9.81;

/** Glen's flow rate factor A of temperate ice in Pa⁻³ yr⁻¹ (2.4·10⁻²⁴ Pa⁻³ s⁻¹, Cuffey & Paterson 2010). */
export const GLEN_RATE_FACTOR = 7.57e-17;

/**
 * Γ = 2A(ρg)³/(n + 2) of the shallow-ice flux for Glen's n = 3, in m⁻³ yr⁻¹.
 * @capability landform-glacial glaciers that flow, slide, carve their valleys wider and deeper and lay moraines
 */
export function iceDeformationRate(rateFactor: number = GLEN_RATE_FACTOR): number {
  return (2 * rateFactor * ICE_WEIGHT * ICE_WEIGHT * ICE_WEIGHT) / 5;
}

/** How ice flows and gains mass. @internal */
export interface IceFlowSettings {
  /** Γ of the deformation flux, m⁻³ yr⁻¹. */
  deformation: number;
  /** Sliding coefficient C in m yr⁻¹ Pa⁻¹. */
  sliding: number;
  /** Equilibrium line altitude in metres. */
  ela: number;
  /** Mass balance gradient β in (m/yr of ice) per metre of altitude. */
  balanceGradient: number;
  /** Largest accumulation in m/yr. */
  maxAccumulation: number;
  /** Effective ice viscosity in Pa·yr coupling neighbouring columns' sliding; 0 slides each column alone. */
  lateralDrag: number;
  /** Per cell, the share of the bed at the pressure-melting point, 0 frozen to 1 sliding; scales `sliding`. Default 1. */
  temperate?: Float64Array;
  /** Per cell i, a multiplier on the flux through the face between i and i + 1 (its east face). Default 1. */
  eastScale?: Float64Array;
  /** Per cell i, a multiplier on the flux through the face between i and i + cols (its south face). Default 1. */
  southScale?: Float64Array;
}

/** How an {@link IceFlow.advance} runs. @internal */
export interface IceAdvanceOptions {
  /** Mass balance in m/yr per cell, replacing the altitude rule. */
  balance?: Float64Array;
  /** Longest implicit step in years. Default 50. */
  maxStep?: number;
  /** Largest mass-conservation residual in m/yr that counts as solved. Default 10⁻⁴. */
  tolerance?: number;
}

/** What an {@link IceFlow.advance} did. @internal */
export interface IceAdvanceReport {
  /** Implicit steps taken. */
  steps: number;
  /** Steps halved because Newton's method did not converge. */
  halvings: number;
  newtonIterations: number;
  linearIterations: number;
  /** Largest |∂H/∂t| in m/yr at the end; 0 at steady state. */
  rate: number;
}

/** A reusable ice solver for one grid. @internal */
export interface IceFlow {
  /** Sliding speed in m/yr at each cell centre after the last {@link IceFlow.advance}. */
  readonly sliding: Float64Array;
  /** Advance `ice` (thickness in metres, in place) over `bed` by `years` and set {@link IceFlow.sliding}. */
  advance(bed: Float64Array, ice: Float64Array, years: number, settings: IceFlowSettings, options?: IceAdvanceOptions): IceAdvanceReport;
  /**
   * Set `eastScale` and `southScale` so ice on each face moves at the speed of the depth-mean velocity
   * (`meanX`, `meanY` in m/yr per cell, averaged onto the face) instead of the shallow-ice speed,
   * within [{@link FACE_SCALE_MIN}, {@link FACE_SCALE_MAX}]; 1 where the upper cell holds under
   * 5 m of ice or the face has no shallow-ice flux. The settings' own scales are ignored.
   */
  matchFaces(bed: Float64Array, ice: Float64Array, settings: IceFlowSettings, meanX: Float64Array, meanY: Float64Array, eastScale: Float64Array, southScale: Float64Array): void;
}

/** Least face flux scale {@link IceFlow.matchFaces} sets. @internal */
export const FACE_SCALE_MIN = 0.02;
/** Largest face flux scale {@link IceFlow.matchFaces} sets. @internal */
export const FACE_SCALE_MAX = 50;
// Faces are matched only between columns at least this thick, in metres; thinner ice is a margin the
// first-order solve holds nearly still, where the ratio says nothing about the flow.
const MATCH_THICKNESS = 5;

/** An ice solver for a topology. @internal */
// stateless: scratch arrays; the ice itself lives in the caller's array.
export function createIceFlow(topology: LandformTopology): IceFlow {
  const { cols, rows, cells, cellSize, base } = topology;
  const dx = cellSize;
  const inv2 = 1 / (dx * dx);
  const surface = new Float64Array(cells);
  const trial = new Float64Array(cells);
  const old = new Float64Array(cells);
  const gradX = new Float64Array(cells);
  const gradY = new Float64Array(cells);
  const residual = new Float64Array(cells);
  const free = new Uint8Array(cells);
  // Face diffusivity and its derivatives by the surface on either side, per east and south face.
  const eastD = new Float64Array(cells);
  const eastDi = new Float64Array(cells);
  const eastDj = new Float64Array(cells);
  const southD = new Float64Array(cells);
  const southDi = new Float64Array(cells);
  const southDj = new Float64Array(cells);
  const eastH = new Float64Array(cells);
  const southH = new Float64Array(cells);
  // Newton matrix, one row per cell: the diagonal and the four neighbours.
  const diag = new Float64Array(cells);
  const east = new Float64Array(cells);
  const west = new Float64Array(cells);
  const south = new Float64Array(cells);
  const north = new Float64Array(cells);
  const pivot = new Float64Array(cells);
  const delta = new Float64Array(cells);
  const rhs = new Float64Array(cells);
  const r = new Float64Array(cells);
  const rHat = new Float64Array(cells);
  const p = new Float64Array(cells);
  const v = new Float64Array(cells);
  const y = new Float64Array(cells);
  const z = new Float64Array(cells);
  const t = new Float64Array(cells);
  const sliding = new Float64Array(cells);
  const slideX = new Float64Array(cells);
  const slideY = new Float64Array(cells);

  // Centred surface gradients, with bare rock standing above a cell's ice counted as level with it:
  // a valley wall holds the ice in, it does not drive it.
  function gradients(s: Float64Array, bed: Float64Array): void {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const i = row * cols + col;
        const own = s[i] ?? 0;
        const at = (j: number): number => {
          const top = s[j] ?? 0;
          return top > own && top <= (bed[j] ?? 0) ? own : top;
        };
        const up = row > 0 ? i - cols : i;
        const down = row < rows - 1 ? i + cols : i;
        const left = col > 0 ? i - 1 : i;
        const right = col < cols - 1 ? i + 1 : i;
        gradY[i] = (at(down) - at(up)) / (dx * ((down === i ? 0 : 1) + (up === i ? 0 : 1)));
        gradX[i] = (at(right) - at(left)) / (dx * ((right === i ? 0 : 1) + (left === i ? 0 : 1)));
      }
    }
  }

  // Face between cells a and b: D = k(Γ H⁵ g² + C ρg H²), with g² the squared surface gradient and H
  // the mean thickness, but no more than the upper cell's, so ice cannot be drawn out of a thin or
  // bare cell above it and the flux goes to zero as that cell empties. Also dD/ds_a and dD/ds_b,
  // holding the cross gradient still.
  function face(s: Float64Array, bed: Float64Array, a: number, b: number, across: number, scale: number, settings: IceFlowSettings, out: Float64Array, outA: Float64Array, outB: Float64Array, outH: Float64Array): void {
    const sa = s[a] ?? 0;
    const sb = s[b] ?? 0;
    const ha = sa - (bed[a] ?? 0);
    const hb = sb - (bed[b] ?? 0);
    const aUpper = sa >= sb;
    const hUpper = aUpper ? ha : hb;
    if (hUpper <= 0 || scale <= 0) {
      out[a] = 0;
      outA[a] = 0;
      outB[a] = 0;
      outH[a] = 0;
      return;
    }
    const mean = 0.5 * (ha + hb);
    const capped = mean > hUpper;
    const h = capped ? hUpper : mean;
    outH[a] = h;
    const byA = capped ? (aUpper ? 1 : 0) : 0.5;
    const byB = capped ? (aUpper ? 0 : 1) : 0.5;
    const along = (sb - sa) / dx;
    const g2 = along * along + across * across;
    const h2 = h * h;
    const h4 = h2 * h2;
    const gamma = settings.deformation;
    const temperate = settings.temperate;
    const slide = settings.sliding * ICE_WEIGHT * (temperate === undefined ? 1 : 0.5 * ((temperate[a] ?? 1) + (temperate[b] ?? 1)));
    out[a] = scale * (gamma * h4 * h * g2 + slide * h2);
    const byH = scale * (5 * gamma * h4 * g2 + 2 * slide * h);
    const byG2 = scale * gamma * h4 * h;
    const tilt = (2 * along) / dx;
    outA[a] = byA * byH - byG2 * tilt;
    outB[a] = byB * byH + byG2 * tilt;
  }

  function balanceAt(i: number, s: number, settings: IceFlowSettings, balance: Float64Array | undefined): number {
    const given = balance?.[i];
    if (given !== undefined) return given;
    const rule = settings.balanceGradient * (s - settings.ela);
    return rule < settings.maxAccumulation ? rule : settings.maxAccumulation;
  }

  // Residual (H − H_old)/dt − b − ∇·(D∇s) per cell; a bare cell that would lose ice reads 0 and is
  // held, the rest are free. Returns the sum of squares over the cells.
  function evaluateFaces(s: Float64Array, bed: Float64Array, settings: IceFlowSettings): void {
    gradients(s, bed);
    const eastScale = settings.eastScale;
    const southScale = settings.southScale;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const i = row * cols + col;
        if (col < cols - 1) face(s, bed, i, i + 1, 0.5 * ((gradY[i] ?? 0) + (gradY[i + 1] ?? 0)), eastScale?.[i] ?? 1, settings, eastD, eastDi, eastDj, eastH);
        else eastD[i] = 0;
        if (row < rows - 1) face(s, bed, i, i + cols, 0.5 * ((gradX[i] ?? 0) + (gradX[i + cols] ?? 0)), southScale?.[i] ?? 1, settings, southD, southDi, southDj, southH);
        else southD[i] = 0;
      }
    }
  }

  function evaluate(s: Float64Array, bed: Float64Array, dt: number, settings: IceFlowSettings, balance: Float64Array | undefined): number {
    evaluateFaces(s, bed, settings);
    let sum = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const i = row * cols + col;
        if (base[i] === 1) {
          residual[i] = 0;
          free[i] = 0;
          continue;
        }
        const si = s[i] ?? 0;
        let inflow = 0;
        if (col < cols - 1) inflow += (eastD[i] ?? 0) * ((s[i + 1] ?? 0) - si);
        if (col > 0) inflow += (eastD[i - 1] ?? 0) * ((s[i - 1] ?? 0) - si);
        if (row < rows - 1) inflow += (southD[i] ?? 0) * ((s[i + cols] ?? 0) - si);
        if (row > 0) inflow += (southD[i - cols] ?? 0) * ((s[i - cols] ?? 0) - si);
        const h = si - (bed[i] ?? 0);
        const f = (h - (old[i] ?? 0)) / dt - balanceAt(i, si, settings, balance) - inflow * inv2;
        const held = h <= 0 && f >= 0;
        free[i] = held ? 0 : 1;
        residual[i] = held ? 0 : f;
        sum += held ? 0 : f * f;
      }
    }
    return sum;
  }

  function largestResidual(): number {
    let largest = 0;
    for (let i = 0; i < cells; i += 1) {
      const f = residual[i] ?? 0;
      const size = f < 0 ? -f : f;
      if (size > largest) largest = size;
    }
    return largest;
  }

  // The Newton matrix ∂F/∂s over free cells (held cells are identity rows), then its ILU(0) pivots.
  function assemble(s: Float64Array, dt: number, settings: IceFlowSettings, balance: Float64Array | undefined): void {
    for (let i = 0; i < cells; i += 1) {
      east[i] = 0;
      west[i] = 0;
      south[i] = 0;
      north[i] = 0;
      if (free[i] !== 1) {
        diag[i] = 1;
        continue;
      }
      const si = s[i] ?? 0;
      const capped = balance !== undefined || settings.balanceGradient * (si - settings.ela) >= settings.maxAccumulation;
      diag[i] = 1 / dt - (capped ? 0 : settings.balanceGradient);
    }
    // Face between a and b adds −D(s_b − s_a)/dx² to F_a and the opposite to F_b.
    const couple = (a: number, b: number, d: number, da: number, db: number, toB: Float64Array, toA: Float64Array): void => {
      if (d === 0 && da === 0 && db === 0) return;
      const jump = (s[b] ?? 0) - (s[a] ?? 0);
      const byA = (da * jump - d) * inv2;
      const byB = (db * jump + d) * inv2;
      if (free[a] === 1) {
        diag[a] = (diag[a] ?? 0) - byA;
        if (free[b] === 1) toB[a] = (toB[a] ?? 0) - byB;
      }
      if (free[b] === 1) {
        diag[b] = (diag[b] ?? 0) + byB;
        if (free[a] === 1) toA[b] = (toA[b] ?? 0) + byA;
      }
    };
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const i = row * cols + col;
        if (col < cols - 1) couple(i, i + 1, eastD[i] ?? 0, eastDi[i] ?? 0, eastDj[i] ?? 0, east, west);
        if (row < rows - 1) couple(i, i + cols, southD[i] ?? 0, southDi[i] ?? 0, southDj[i] ?? 0, south, north);
      }
    }
    for (let i = 0; i < cells; i += 1) {
      let d = diag[i] ?? 1;
      const w = i % cols > 0 ? i - 1 : -1;
      const n = i >= cols ? i - cols : -1;
      if (w >= 0) d -= ((west[i] ?? 0) * (east[w] ?? 0)) / (pivot[w] ?? 1);
      if (n >= 0) d -= ((north[i] ?? 0) * (south[n] ?? 0)) / (pivot[n] ?? 1);
      pivot[i] = d !== 0 ? d : 1e-30;
    }
  }

  function multiply(x: Float64Array, out: Float64Array): void {
    for (let i = 0; i < cells; i += 1) {
      let sum = (diag[i] ?? 0) * (x[i] ?? 0);
      if (i % cols < cols - 1) sum += (east[i] ?? 0) * (x[i + 1] ?? 0);
      if (i % cols > 0) sum += (west[i] ?? 0) * (x[i - 1] ?? 0);
      if (i + cols < cells) sum += (south[i] ?? 0) * (x[i + cols] ?? 0);
      if (i >= cols) sum += (north[i] ?? 0) * (x[i - cols] ?? 0);
      out[i] = sum;
    }
  }

  // Apply (D + L)⁻¹ then (I + D⁻¹U)⁻¹ of the incomplete factors.
  function precondition(x: Float64Array, out: Float64Array): void {
    for (let i = 0; i < cells; i += 1) {
      let sum = x[i] ?? 0;
      if (i % cols > 0) sum -= (west[i] ?? 0) * (out[i - 1] ?? 0);
      if (i >= cols) sum -= (north[i] ?? 0) * (out[i - cols] ?? 0);
      out[i] = sum / (pivot[i] ?? 1);
    }
    for (let i = cells - 1; i >= 0; i -= 1) {
      let sum = 0;
      if (i % cols < cols - 1) sum += (east[i] ?? 0) * (out[i + 1] ?? 0);
      if (i + cols < cells) sum += (south[i] ?? 0) * (out[i + cols] ?? 0);
      out[i] = (out[i] ?? 0) - sum / (pivot[i] ?? 1);
    }
  }

  function dot(a: Float64Array, b: Float64Array): number {
    let sum = 0;
    for (let i = 0; i < cells; i += 1) sum += (a[i] ?? 0) * (b[i] ?? 0);
    return sum;
  }

  // Solve the Newton system for `delta` from `rhs` by right-preconditioned BiCGSTAB; returns iterations.
  function bicgstab(): number {
    delta.fill(0);
    r.set(rhs);
    rHat.set(rhs);
    p.fill(0);
    v.fill(0);
    const target = LINEAR_TOLERANCE * LINEAR_TOLERANCE * dot(rhs, rhs);
    if (target === 0) return 0;
    let rho = 1;
    let alpha = 1;
    let omega = 1;
    for (let k = 1; k <= LINEAR_ITERATIONS; k += 1) {
      const rhoNext = dot(rHat, r);
      if (rhoNext === 0) return k;
      const beta = (rhoNext / rho) * (alpha / omega);
      rho = rhoNext;
      for (let i = 0; i < cells; i += 1) p[i] = (r[i] ?? 0) + beta * ((p[i] ?? 0) - omega * (v[i] ?? 0));
      precondition(p, y);
      multiply(y, v);
      const along = dot(rHat, v);
      if (along === 0) return k;
      alpha = rho / along;
      for (let i = 0; i < cells; i += 1) {
        delta[i] = (delta[i] ?? 0) + alpha * (y[i] ?? 0);
        r[i] = (r[i] ?? 0) - alpha * (v[i] ?? 0);
      }
      if (dot(r, r) <= target) return k;
      precondition(r, z);
      multiply(z, t);
      const tt = dot(t, t);
      omega = tt > 0 ? dot(t, r) / tt : 0;
      for (let i = 0; i < cells; i += 1) {
        delta[i] = (delta[i] ?? 0) + omega * (z[i] ?? 0);
        r[i] = (r[i] ?? 0) - omega * (t[i] ?? 0);
      }
      if (dot(r, r) <= target || omega === 0) return k;
    }
    return LINEAR_ITERATIONS;
  }

  // One backward-Euler step of dt from `old`; leaves the answer in `surface`. False when Newton stalls.
  function implicitStep(bed: Float64Array, dt: number, settings: IceFlowSettings, balance: Float64Array | undefined, tolerance: number, report: IceAdvanceReport): boolean {
    for (let i = 0; i < cells; i += 1) surface[i] = (bed[i] ?? 0) + (old[i] ?? 0);
    let size = evaluate(surface, bed, dt, settings, balance);
    for (let iteration = 0; iteration < NEWTON_ITERATIONS; iteration += 1) {
      if (largestResidual() < tolerance) return true;
      report.newtonIterations += 1;
      assemble(surface, dt, settings, balance);
      for (let i = 0; i < cells; i += 1) rhs[i] = free[i] === 1 ? -(residual[i] ?? 0) : 0;
      report.linearIterations += bicgstab();
      // Backtrack along the Newton step, kept above the bed, until the residual falls.
      let step = 1;
      let accepted = false;
      for (let tries = 0; tries < 10 && !accepted; tries += 1) {
        for (let i = 0; i < cells; i += 1) {
          const next = (surface[i] ?? 0) + step * (delta[i] ?? 0);
          const floor = bed[i] ?? 0;
          trial[i] = base[i] === 1 || next < floor ? floor : next;
        }
        const trialSize = evaluate(trial, bed, dt, settings, balance);
        if (trialSize < size) {
          surface.set(trial);
          size = trialSize;
          accepted = true;
        } else step *= 0.5;
      }
      if (!accepted) {
        evaluate(surface, bed, dt, settings, balance);
        return largestResidual() < tolerance;
      }
    }
    return largestResidual() < tolerance;
  }

  return {
    sliding,
    advance(bed, ice, years, settings, options = {}) {
      const report: IceAdvanceReport = { steps: 0, halvings: 0, newtonIterations: 0, linearIterations: 0, rate: 0 };
      const longest = options.maxStep ?? 50;
      const tolerance = options.tolerance ?? 1e-4;
      const balance = options.balance;
      // Newton iterations allowed before steps stop halving: the bound on one call's work.
      const budget = NEWTON_ITERATIONS * 4 * Math.ceil(years / longest);
      let remaining = years;
      let dt = longest < years ? longest : years;
      while (remaining > 0) {
        if (dt > remaining) dt = remaining;
        for (let i = 0; i < cells; i += 1) old[i] = base[i] === 1 ? 0 : (ice[i] ?? 0);
        const converged = implicitStep(bed, dt, settings, balance, tolerance, report);
        // A step that will not converge is halved, down to a sixteenth of a year or until the budget is
        // spent, and then taken as it stands.
        if (!converged && dt > SHORTEST_STEP && report.newtonIterations < budget) {
          dt *= 0.5;
          report.halvings += 1;
          continue;
        }
        let rate = 0;
        for (let i = 0; i < cells; i += 1) {
          const h = (surface[i] ?? 0) - (bed[i] ?? 0);
          const next = base[i] === 1 || h < 0 ? 0 : h;
          const change = next - (old[i] ?? 0);
          const speed = (change < 0 ? -change : change) / dt;
          if (speed > rate) rate = speed;
          ice[i] = next;
        }
        report.rate = rate;
        report.steps += 1;
        remaining -= dt;
        dt = 2 * dt < longest ? 2 * dt : longest;
      }
      for (let i = 0; i < cells; i += 1) surface[i] = (bed[i] ?? 0) + (ice[i] ?? 0);
      gradients(surface, bed);
      slide(bed, ice, settings);
      return report;
    },
    matchFaces(bed, ice, settings, meanX, meanY, eastScale, southScale) {
      for (let i = 0; i < cells; i += 1) surface[i] = (bed[i] ?? 0) + (ice[i] ?? 0);
      const { deformation, sliding: slip, ela, balanceGradient, maxAccumulation, lateralDrag, temperate } = settings;
      evaluateFaces(surface, bed, { deformation, sliding: slip, ela, balanceGradient, maxAccumulation, lateralDrag, ...(temperate === undefined ? {} : { temperate }) });
      // A face between two thick columns moves at their mean velocity; next to a thin one, at the
      // upper column's own, since the first-order solve holds thin ice nearly still. The scale is that
      // speed over the shallow-ice speed D|∇s|/H on the face.
      const ratio = (a: number, b: number, d: number, thickness: number, gradient: number): number => {
        const thickA = (ice[a] ?? 0) >= MATCH_THICKNESS;
        const thickB = (ice[b] ?? 0) >= MATCH_THICKNESS;
        const upperA = (surface[a] ?? 0) >= (surface[b] ?? 0);
        let ux: number;
        let uy: number;
        if (thickA && thickB) {
          ux = 0.5 * ((meanX[a] ?? 0) + (meanX[b] ?? 0));
          uy = 0.5 * ((meanY[a] ?? 0) + (meanY[b] ?? 0));
        } else if (upperA ? thickA : thickB) {
          ux = meanX[upperA ? a : b] ?? 0;
          uy = meanY[upperA ? a : b] ?? 0;
        } else return 1;
        const shallow = thickness > 0 ? (d * gradient) / thickness : 0;
        if (!(shallow > 1e-6)) return 1;
        const value = Math.sqrt(ux * ux + uy * uy) / shallow;
        return value < FACE_SCALE_MIN ? FACE_SCALE_MIN : value > FACE_SCALE_MAX ? FACE_SCALE_MAX : value;
      };
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const i = row * cols + col;
          const s = surface[i] ?? 0;
          if (col < cols - 1) {
            const along = ((surface[i + 1] ?? 0) - s) / dx;
            const across = 0.5 * ((gradY[i] ?? 0) + (gradY[i + 1] ?? 0));
            eastScale[i] = ratio(i, i + 1, eastD[i] ?? 0, eastH[i] ?? 0, Math.sqrt(along * along + across * across));
          } else eastScale[i] = 1;
          if (row < rows - 1) {
            const along = ((surface[i + cols] ?? 0) - s) / dx;
            const across = 0.5 * ((gradX[i] ?? 0) + (gradX[i + cols] ?? 0));
            southScale[i] = ratio(i, i + cols, southD[i] ?? 0, southH[i] ?? 0, Math.sqrt(along * along + across * across));
          } else southScale[i] = 1;
        }
      }
    },
  };

  // How much of column i's ice faces column j's ice, and how much faces rock, in metres.
  function faceContact(bed: Float64Array, ice: Float64Array, i: number, j: number): [number, number] {
    const floor = bed[i] ?? 0;
    const top = surface[i] ?? 0;
    const theirBed = bed[j] ?? 0;
    const rockTop = theirBed < top ? theirBed : top;
    const rock = rockTop > floor ? rockTop - floor : 0;
    if ((ice[j] ?? 0) <= 0) return [0, rock];
    const theirTop = surface[j] ?? 0;
    const iceTop = theirTop < top ? theirTop : top;
    const iceBottom = theirBed > floor ? theirBed : floor;
    return [iceTop > iceBottom ? iceTop - iceBottom : 0, rock];
  }

  // Lateral drag. Each face of a column meets the neighbouring column's ice where that ice stands
  // level with it, and rock where the neighbour's bed rises above this column's bed. A face shears
  // only the motion along it: ice drags by its speed difference and rock holds it still. Ice in the
  // bottom of a V, walled by rock on both sides, so slides slower than ice on its flanks (Harbor
  // 1992). Per component, u = C·(τ_d + K·Σ(ice·u_j − (ice + rock)·u)), K = η/Δx², solved cell by
  // cell in place.
  function slide(bed: Float64Array, ice: Float64Array, settings: IceFlowSettings): void {
    const drag = settings.lateralDrag;
    const temperate = settings.temperate;
    const at = (i: number): number => settings.sliding * (temperate?.[i] ?? 1);
    for (let i = 0; i < cells; i += 1) {
      const h = ice[i] ?? 0;
      slideX[i] = h > 0 ? -at(i) * ICE_WEIGHT * h * (gradX[i] ?? 0) : 0;
      slideY[i] = h > 0 ? -at(i) * ICE_WEIGHT * h * (gradY[i] ?? 0) : 0;
    }
    if (drag > 0 && settings.sliding > 0) {
      const k = drag / (dx * dx);
      for (let pass = 0; pass < DRAG_PASSES; pass += 1) {
        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < cols; col += 1) {
            const i = row * cols + col;
            const h = ice[i] ?? 0;
            const c = at(i);
            if (h <= 0 || base[i] === 1 || c <= 0) continue;
            // East and west faces shear the north-south motion; north and south faces the east-west.
            let pulledX = 0;
            let heldX = 0;
            let pulledY = 0;
            let heldY = 0;
            for (let side = 0; side < 4; side += 1) {
              const j = side === 0 ? (col > 0 ? i - 1 : -1) : side === 1 ? (col < cols - 1 ? i + 1 : -1) : side === 2 ? (row > 0 ? i - cols : -1) : row < rows - 1 ? i + cols : -1;
              if (j < 0) continue;
              const [contact, rock] = faceContact(bed, ice, i, j);
              if (side < 2) {
                pulledY += contact * (slideY[j] ?? 0);
                heldY += contact + rock;
              } else {
                pulledX += contact * (slideX[j] ?? 0);
                heldX += contact + rock;
              }
            }
            slideX[i] = (c * (-ICE_WEIGHT * h * (gradX[i] ?? 0) + k * pulledX)) / (1 + c * k * heldX);
            slideY[i] = (c * (-ICE_WEIGHT * h * (gradY[i] ?? 0) + k * pulledY)) / (1 + c * k * heldY);
          }
        }
      }
    }
    for (let i = 0; i < cells; i += 1) {
      const ux = slideX[i] ?? 0;
      const uy = slideY[i] ?? 0;
      sliding[i] = Math.sqrt(ux * ux + uy * uy);
    }
  }
}
