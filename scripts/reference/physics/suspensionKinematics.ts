/** A point or direction in body axes: x forward, y left, z up, metres. */
export type SuspensionPoint = readonly [number, number, number];

/**
 * Short-long-arm double wishbone (also a fair stand-in for a five-link rear): two A-arms on the body, an upright
 * between their ball joints, a tie rod (or toe link) setting steer, and a coil-over from the body to the lower arm.
 * Points are for the left corner, body axes at design ride height: x from the axle line, y from the car's centreline,
 * z above the ground.
 */
export interface DoubleWishboneGeometry {
  kind: "doubleWishbone";
  lowerFront: SuspensionPoint;
  lowerRear: SuspensionPoint;
  lowerBallJoint: SuspensionPoint;
  upperFront: SuspensionPoint;
  upperRear: SuspensionPoint;
  upperBallJoint: SuspensionPoint;
  tieRodInner: SuspensionPoint;
  tieRodOuter: SuspensionPoint;
  wheelCenter: SuspensionPoint;
  /** Static camber, rad (negative tops the wheel inboard), and toe, rad (positive points the nose inboard). */
  camber: number;
  toe: number;
  /** Coil-over top on the body and bottom on the lower arm. */
  springBody: SuspensionPoint;
  springArm: SuspensionPoint;
}

/**
 * MacPherson strut: one lower arm, and a strut fixed to the upright that slides through a top mount on the body. The
 * strut line runs through `strutTop` and `strutLower` (a point on the upright) at design; the coil-over acts along it.
 */
export interface MacPhersonGeometry {
  kind: "macPherson";
  lowerFront: SuspensionPoint;
  lowerRear: SuspensionPoint;
  lowerBallJoint: SuspensionPoint;
  strutTop: SuspensionPoint;
  strutLower: SuspensionPoint;
  tieRodInner: SuspensionPoint;
  tieRodOuter: SuspensionPoint;
  wheelCenter: SuspensionPoint;
  camber: number;
  toe: number;
}

/** One corner's linkage. */
export type SuspensionGeometry = DoubleWishboneGeometry | MacPhersonGeometry;

/** Where the linkage puts the upright for one lower-arm angle and rack position (left corner, body axes). */
export interface SuspensionPose {
  wheelCenter: [number, number, number];
  /** Spin axis, unit, pointing outboard. */
  axle: [number, number, number];
  /** Upright rotation from its design attitude, row-major 3×3. */
  rotation: number[];
  /** Coil-over length, m. */
  springLength: number;
  /** A point on the steering (kingpin) axis and its unit direction, lower to upper. */
  kingpinPoint: [number, number, number];
  kingpinAxis: [number, number, number];
}

type V = [number, number, number];

function sub(a: SuspensionPoint, b: SuspensionPoint): V {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function add(a: SuspensionPoint, b: SuspensionPoint): V {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function scale(a: SuspensionPoint, s: number): V {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function dot(a: SuspensionPoint, b: SuspensionPoint): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: SuspensionPoint, b: SuspensionPoint): V {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm(a: SuspensionPoint): number {
  return Math.hypot(a[0], a[1], a[2]);
}
function unit(a: SuspensionPoint): V {
  const n = norm(a) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
}

/** Rotation matrix about unit axis `k` by `angle` (Rodrigues), row-major. */
function axisAngle(k: SuspensionPoint, angle: number): number[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  const [x, y, z] = k;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}

/** The smallest rotation taking unit `from` onto unit `to`. */
function between(from: SuspensionPoint, to: SuspensionPoint): number[] {
  const axis = cross(from, to);
  const s = norm(axis);
  const c = dot(from, to);
  if (s < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  return axisAngle(scale(axis, 1 / s), Math.atan2(s, c));
}

function apply(m: readonly number[], v: SuspensionPoint): V {
  return [
    (m[0] ?? 0) * v[0] + (m[1] ?? 0) * v[1] + (m[2] ?? 0) * v[2],
    (m[3] ?? 0) * v[0] + (m[4] ?? 0) * v[1] + (m[5] ?? 0) * v[2],
    (m[6] ?? 0) * v[0] + (m[7] ?? 0) * v[1] + (m[8] ?? 0) * v[2],
  ];
}

function multiply(a: readonly number[], b: readonly number[]): number[] {
  const out: number[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push((a[r * 3] ?? 0) * (b[c] ?? 0) + (a[r * 3 + 1] ?? 0) * (b[3 + c] ?? 0) + (a[r * 3 + 2] ?? 0) * (b[6 + c] ?? 0));
  return out;
}

/** Rotate point `p` about the line through `origin` along unit `axis`. */
function rotateAbout(p: SuspensionPoint, origin: SuspensionPoint, axis: SuspensionPoint, angle: number): V {
  return add(origin, apply(axisAngle(axis, angle), sub(p, origin)));
}

/** Root of `f` near `guess` by the secant method with bisection safeguarding inside `[lo, hi]`. */
function solve(f: (x: number) => number, guess: number, lo: number, hi: number): number {
  let a = lo;
  let b = hi;
  let fa = f(a);
  let x0 = guess;
  let x1 = guess + 1e-4;
  let f0 = f(x0);
  let f1 = f(x1);
  for (let i = 0; i < 60; i++) {
    if (Math.abs(f1) < 1e-13) return x1;
    let next = f1 !== f0 ? x1 - (f1 * (x1 - x0)) / (f1 - f0) : 0.5 * (a + b);
    if (!(next > a && next < b)) next = 0.5 * (a + b);
    x0 = x1;
    f0 = f1;
    x1 = next;
    f1 = f(x1);
    if (Math.sign(f1) === Math.sign(fa)) {
      a = x1;
      fa = f1;
    } else b = x1;
  }
  return x1;
}

/** The lower arm's pivot axis, signed so a positive turn raises the ball joint. */
function raisingAxis(g: SuspensionGeometry): V {
  const axis = unit(sub(g.lowerRear, g.lowerFront));
  return cross(axis, sub(g.lowerBallJoint, g.lowerFront))[2] < 0 ? scale(axis, -1) : axis;
}

/** Upright attitude: map the design kingpin direction onto the current one, then turn about it by `psi`. */
function uprightRotation(designAxis: SuspensionPoint, axis: SuspensionPoint, psi: number): number[] {
  return multiply(axisAngle(axis, psi), between(designAxis, axis));
}

/**
 * Solve the linkage: the lower arm turned `theta` rad about its body pivots (positive raises the wheel on a typical
 * corner), the rack moved `rack` m toward +y. Exact closure of every link length, no small-angle terms.
 * @capability suspension-kinematics solve a double-wishbone or MacPherson corner from hardpoints — camber, toe, track and spring length through travel and steer
 */
export function solveSuspension(geometry: SuspensionGeometry, theta: number, rack: number, guess: { upper: number; psi: number } = { upper: 0, psi: 0 }): SuspensionPose & { upper: number; psi: number } {
  const g = geometry;
  const lowerAxis = raisingAxis(g);
  const lbj = rotateAbout(g.lowerBallJoint, g.lowerFront, lowerAxis, theta);
  const tieInner: V = [g.tieRodInner[0], g.tieRodInner[1] + rack, g.tieRodInner[2]];
  const tieLength = norm(sub(g.tieRodOuter, g.tieRodInner));
  let rotation: number[];
  let anchor: V;
  let anchorDesign: SuspensionPoint;
  let upper = 0;
  let springLength: number;
  let kingpinTop: V;
  if (g.kind === "doubleWishbone") {
    const upperAxis = unit(sub(g.upperRear, g.upperFront));
    const uprightLength = norm(sub(g.upperBallJoint, g.lowerBallJoint));
    const ubjAt = (phi: number) => rotateAbout(g.upperBallJoint, g.upperFront, upperAxis, phi);
    upper = solve((phi) => norm(sub(ubjAt(phi), lbj)) - uprightLength, guess.upper, guess.upper - 1, guess.upper + 1);
    const ubj = ubjAt(upper);
    const design = unit(sub(g.upperBallJoint, g.lowerBallJoint));
    const current = unit(sub(ubj, lbj));
    const tieError = (psi: number) => norm(sub(add(lbj, apply(uprightRotation(design, current, psi), sub(g.tieRodOuter, g.lowerBallJoint))), tieInner)) - tieLength;
    const psi = solve(tieError, guess.psi, guess.psi - 0.8, guess.psi + 0.8);
    rotation = uprightRotation(design, current, psi);
    anchor = lbj;
    anchorDesign = g.lowerBallJoint;
    springLength = norm(sub(g.springBody, rotateAbout(g.springArm, g.lowerFront, lowerAxis, theta)));
    kingpinTop = ubj;
    return finish(psi);
  }
  // MacPherson: the vector from the ball joint to the top mount, in upright axes, lies on the strut line.
  const q0 = sub(g.strutLower, g.lowerBallJoint);
  const s0 = unit(sub(g.strutTop, g.strutLower));
  const toTop = sub(g.strutTop, lbj);
  const reach = norm(toTop);
  const b = dot(q0, s0);
  const t = -b + Math.sqrt(Math.max(0, b * b - (dot(q0, q0) - reach * reach)));
  const designDir = unit(add(q0, scale(s0, t)));
  const currentDir = unit(toTop);
  const tieError = (psi: number) => norm(sub(add(lbj, apply(uprightRotation(designDir, currentDir, psi), sub(g.tieRodOuter, g.lowerBallJoint))), tieInner)) - tieLength;
  const psi = solve(tieError, guess.psi, guess.psi - 0.8, guess.psi + 0.8);
  rotation = uprightRotation(designDir, currentDir, psi);
  anchor = lbj;
  anchorDesign = g.lowerBallJoint;
  springLength = norm(sub(g.strutTop, add(lbj, apply(rotation, q0))));
  kingpinTop = [g.strutTop[0], g.strutTop[1], g.strutTop[2]];
  return finish(psi);

  function finish(psi: number): SuspensionPose & { upper: number; psi: number } {
    const wheelCenter = add(anchor, apply(rotation, sub(g.wheelCenter, anchorDesign)));
    return {
      wheelCenter,
      axle: apply(rotation, designAxle(g)),
      rotation,
      springLength,
      kingpinPoint: lbj,
      kingpinAxis: unit(sub(kingpinTop, lbj)),
      upper,
      psi,
    };
  }
}

/** The design spin axis from the static alignment: outboard, tilted by camber, turned by toe. */
function designAxle(g: SuspensionGeometry): V {
  const heading: V = [Math.cos(g.toe), -Math.sin(g.toe), 0];
  const outboard = cross([0, 0, 1], heading);
  return unit(add(scale(outboard, Math.cos(g.camber)), [0, 0, -Math.sin(g.camber)]));
}

/** Tabulated linkage for fast, smooth lookup: value and θ-derivatives at grid nodes, cubic in θ and linear in rack. */
export interface SuspensionTable {
  /** Lower-arm angle range covered, rad. */
  readonly thetaMin: number;
  readonly thetaMax: number;
  /** Rack range covered, m (both 0 for a corner without steering). */
  readonly rackMin: number;
  readonly rackMax: number;
  /** Fill `out` with the pose at (`theta`, `rack`); see {@link SuspensionSample}. */
  sample(theta: number, rack: number, out: SuspensionSample): SuspensionSample;
}

/**
 * Pose and its derivatives with respect to the lower-arm angle θ, what a multibody equation of motion needs: wheel
 * centre `w`, `dw/dθ`, `d²w/dθ²`; spin axis and `d(axle)/dθ`; the upright's angular velocity per unit θ̇; coil-over
 * length and `dl/dθ`; kingpin point and axis. Left corner, body axes.
 */
export interface SuspensionSample {
  w: number[];
  dw: number[];
  ddw: number[];
  axle: number[];
  daxle: number[];
  spin: number[];
  springLength: number;
  dSpringLength: number;
  kingpinPoint: number[];
  kingpinAxis: number[];
}

/**
 * An empty {@link SuspensionSample} to reuse with {@link SuspensionTable.sample}.
 * @capability suspension-kinematics allocate a reusable sample for table lookups in a hot loop
 */
export function createSuspensionSample(): SuspensionSample {
  return { w: [0, 0, 0], dw: [0, 0, 0], ddw: [0, 0, 0], axle: [0, 0, 0], daxle: [0, 0, 0], spin: [0, 0, 0], springLength: 0, dSpringLength: 0, kingpinPoint: [0, 0, 0], kingpinAxis: [0, 0, 0] };
}

// Per node: w(3) dw(3) ddw(3) axle(3) daxle(3) spin(3) l dl kingpinPoint(3) kingpinAxis(3) dddw(3) ddaxle(3)
const W = 0;
const DW = 3;
const DDW = 6;
const AX = 9;
const DAX = 12;
const SPIN = 15;
const L = 18;
const DL = 19;
const KP = 20;
const KA = 23;
const DDDW = 26;
const DDAX = 29;
const STRIDE = 32;

/**
 * Tabulate a corner's linkage over lower-arm angles `[thetaMin, thetaMax]` and rack travel `±rackTravel` by exact
 * solves; θ-derivatives come from central differences of exact solves.
 * @capability suspension-kinematics tabulate a corner's exact linkage for fast lookups with smooth derivatives in a vehicle sim
 */
export function createSuspensionTable(geometry: SuspensionGeometry, range: { thetaMin: number; thetaMax: number; rackTravel?: number; thetaNodes?: number; rackNodes?: number }): SuspensionTable {
  const nt = range.thetaNodes ?? 81;
  const rackTravel = range.rackTravel ?? 0;
  const nr = rackTravel > 0 ? (range.rackNodes ?? 41) : 1;
  const dTheta = (range.thetaMax - range.thetaMin) / (nt - 1);
  const dRack = nr > 1 ? (2 * rackTravel) / (nr - 1) : 1;
  const data = new Float64Array(nt * nr * STRIDE);
  const delta = 1e-4;
  for (let j = 0; j < nr; j++) {
    const rack = nr > 1 ? -rackTravel + j * dRack : 0;
    let guess = { upper: 0, psi: 0 };
    let centreGuess = guess;
    const centre = Math.round(-range.thetaMin / dTheta);
    const order: number[] = [];
    for (let i = centre; i < nt; i++) order.push(i);
    for (let i = centre - 1; i >= 0; i--) order.push(i);
    for (const i of order) {
      if (i === centre - 1) guess = centreGuess;
      const theta = range.thetaMin + i * dTheta;
      const poses = [-2, -1, 0, 1, 2].map((k) => solveSuspension(geometry, theta + k * delta, rack, guess));
      const [m2, m1, p0, p1, p2] = poses;
      if (m2 === undefined || m1 === undefined || p0 === undefined || p1 === undefined || p2 === undefined) continue;
      guess = { upper: p0.upper, psi: p0.psi };
      if (i === centre) centreGuess = guess;
      const base = (j * nt + i) * STRIDE;
      for (let k = 0; k < 3; k++) {
        const a = m2.wheelCenter[k] ?? 0;
        const b = m1.wheelCenter[k] ?? 0;
        const c = p0.wheelCenter[k] ?? 0;
        const d = p1.wheelCenter[k] ?? 0;
        const e = p2.wheelCenter[k] ?? 0;
        data[base + W + k] = c;
        data[base + DW + k] = (a - 8 * b + 8 * d - e) / (12 * delta);
        data[base + DDW + k] = (-a + 16 * b - 30 * c + 16 * d - e) / (12 * delta * delta);
        data[base + DDDW + k] = (-a + 2 * b - 2 * d + e) / (2 * delta ** 3);
        const aa = m2.axle[k] ?? 0;
        const ab = m1.axle[k] ?? 0;
        const ad = p1.axle[k] ?? 0;
        const ae = p2.axle[k] ?? 0;
        data[base + AX + k] = p0.axle[k] ?? 0;
        data[base + DAX + k] = (aa - 8 * ab + 8 * ad - ae) / (12 * delta);
        data[base + DDAX + k] = (-aa + 16 * ab - 30 * (p0.axle[k] ?? 0) + 16 * ad - ae) / (12 * delta * delta);
        data[base + KP + k] = p0.kingpinPoint[k] ?? 0;
        data[base + KA + k] = p0.kingpinAxis[k] ?? 0;
      }
      // Upright angular velocity per unit θ̇: the skew part of (dR/dθ)·Rᵀ.
      const r = p0.rotation;
      const dr = p1.rotation.map((value, k) => (value - (m1.rotation[k] ?? 0)) / (2 * delta));
      const rt = [r[0], r[3], r[6], r[1], r[4], r[7], r[2], r[5], r[8]].map((value) => value ?? 0);
      const omega = multiply(dr, rt);
      data[base + SPIN] = 0.5 * ((omega[7] ?? 0) - (omega[5] ?? 0));
      data[base + SPIN + 1] = 0.5 * ((omega[2] ?? 0) - (omega[6] ?? 0));
      data[base + SPIN + 2] = 0.5 * ((omega[3] ?? 0) - (omega[1] ?? 0));
      data[base + L] = p0.springLength;
      data[base + DL] = (m2.springLength - 8 * m1.springLength + 8 * p1.springLength - p2.springLength) / (12 * delta);
    }
  }

  return {
    thetaMin: range.thetaMin,
    thetaMax: range.thetaMax,
    rackMin: -rackTravel,
    rackMax: rackTravel,
    sample(theta, rack, out) {
      const ft = Math.max(0, Math.min(nt - 1 - 1e-9, (theta - range.thetaMin) / dTheta));
      const i = Math.floor(ft);
      const t = ft - i;
      const fr = nr > 1 ? Math.max(0, Math.min(nr - 1 - 1e-9, (rack + rackTravel) / dRack)) : 0;
      const j = Math.floor(fr);
      const u = fr - j;
      // Cubic Hermite in θ on value + slope, then linear in rack.
      const h00 = 2 * t ** 3 - 3 * t * t + 1;
      const h10 = t ** 3 - 2 * t * t + t;
      const h01 = -2 * t ** 3 + 3 * t * t;
      const h11 = t ** 3 - t * t;
      const g00 = (6 * t * t - 6 * t) / dTheta;
      const g10 = 3 * t * t - 4 * t + 1;
      const g01 = (-6 * t * t + 6 * t) / dTheta;
      const g11 = 3 * t * t - 2 * t;
      const hermite = (offset: number, slopeOffset: number, jj: number) => {
        const a = (jj * nt + i) * STRIDE;
        const b = a + STRIDE;
        return h00 * (data[a + offset] ?? 0) + h10 * dTheta * (data[a + slopeOffset] ?? 0) + h01 * (data[b + offset] ?? 0) + h11 * dTheta * (data[b + slopeOffset] ?? 0);
      };
      const hermiteSlope = (offset: number, slopeOffset: number, jj: number) => {
        const a = (jj * nt + i) * STRIDE;
        const b = a + STRIDE;
        return g00 * (data[a + offset] ?? 0) + g10 * (data[a + slopeOffset] ?? 0) + g01 * (data[b + offset] ?? 0) + g11 * (data[b + slopeOffset] ?? 0);
      };
      const linear = (offset: number, jj: number) => {
        const a = (jj * nt + i) * STRIDE;
        return (1 - t) * (data[a + offset] ?? 0) + t * (data[a + STRIDE + offset] ?? 0);
      };
      const mix = (fn: (jj: number) => number) => (nr > 1 ? (1 - u) * fn(j) + u * fn(j + 1) : fn(0));
      for (let k = 0; k < 3; k++) {
        out.w[k] = mix((jj) => hermite(W + k, DW + k, jj));
        out.dw[k] = mix((jj) => hermite(DW + k, DDW + k, jj));
        out.ddw[k] = mix((jj) => hermite(DDW + k, DDDW + k, jj));
        out.axle[k] = mix((jj) => hermite(AX + k, DAX + k, jj));
        out.daxle[k] = mix((jj) => hermite(DAX + k, DDAX + k, jj));
        out.spin[k] = mix((jj) => linear(SPIN + k, jj));
        out.kingpinPoint[k] = mix((jj) => linear(KP + k, jj));
        out.kingpinAxis[k] = mix((jj) => linear(KA + k, jj));
      }
      out.springLength = mix((jj) => hermite(L, DL, jj));
      out.dSpringLength = mix((jj) => hermiteSlope(L, DL, jj));
      return out;
    },
  };
}
