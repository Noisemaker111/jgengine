/**
 * Coefficients of the motorcycle Magic Formula as identified by Sharp, Evangelou & Limebeer (2004), "Advances in
 * the modelling of motorcycle dynamics", *Multibody System Dynamics* 12:251–283, §4 and Tables I–III, from the
 * de Vries & Pacejka (1998) measurements. Camber enters the side force as its own arctangent term (the
 * motorcycle form of Pacejka, *Tyre and Vehicle Dynamics*, ch. 11), so a leaned tyre carries camber thrust
 * without sideslip. SI units, angles in rad.
 */
export interface MotorcycleTireCoefficients {
  /** Nominal load Fz0, N. */
  fz0: number;
  /** Crown radius R0 of the tread's circular cross-section, m (the moment arm scale in Dt and Dr). */
  crownRadius: number;
  // Pure longitudinal slip (Eqs. 1–6, Table I).
  cx: number;
  pdx1: number;
  pdx2: number;
  pex1: number;
  pex2: number;
  pex3: number;
  pex4: number;
  pkx1: number;
  pkx2: number;
  pkx3: number;
  // Pure side slip and camber (Eqs. 7–13, Table II).
  cy: number;
  pdy1: number;
  pdy2: number;
  pdy3: number;
  pey1: number;
  pey2: number;
  pey4: number;
  pky1: number;
  pky2: number;
  pky3: number;
  pky4: number;
  pky5: number;
  cGamma: number;
  pky6: number;
  pky7: number;
  eGamma: number;
  // Aligning moment (Eqs. 14–22, Table III).
  ct: number;
  qbz1: number;
  qbz2: number;
  qbz5: number;
  qbz6: number;
  qbz9: number;
  qbz10: number;
  qdz1: number;
  qdz2: number;
  qdz3: number;
  qdz4: number;
  qdz8: number;
  qdz9: number;
  qdz10: number;
  qdz11: number;
  qez1: number;
  qez2: number;
  qez5: number;
  qhz3: number;
  qhz4: number;
  // Combined slip (Eqs. 23–26, §4.4).
  rbx1: number;
  rbx2: number;
  cxa: number;
  rby1: number;
  rby2: number;
  rby3: number;
  cyk: number;
  /** Lateral relaxation length per cornering stiffness, `σα = Kyα·(r0 + r1·V + r2·V²)` (§4.8), m per N/rad. */
  relaxation: readonly [number, number, number];
}

const LONGITUDINAL_160_70 = { cx: 1.6064, pex1: 0.0263, pex2: 0.27056, pex3: -0.0769, pex4: 1.1268, pkx1: 25.94, pkx2: -4.233, pkx3: 0.3369 };
const COMBINED = { rbx1: 13.476, rbx2: 11.354, cxa: 1.1231, rby1: 7.7856, rby2: 8.1697, rby3: -0.05914, cyk: 1.0533 };

/**
 * Front 120/70 ZR17 sport tyre (Sharp, Evangelou & Limebeer 2004, Tables II–III middle rows; longitudinal shape
 * from the 160/70 fit with pDx1 = 1.381, pDx2 = −0.04143, §4.5; relaxation §4.8).
 */
export const SPORT_FRONT_120_70_ZR17: Readonly<MotorcycleTireCoefficients> = {
  fz0: 1100,
  crownRadius: 0.06,
  ...LONGITUDINAL_160_70,
  pdx1: 1.381,
  pdx2: -0.04143,
  cy: 0.8327,
  pdy1: 1.3,
  pdy2: 0,
  pdy3: 0,
  pey1: -1.2556,
  pey2: -3.2068,
  pey4: -3.998,
  pky1: 22.841,
  pky2: 2.1578,
  pky3: 2.5058,
  pky4: -0.08088,
  pky5: -0.22882,
  cGamma: 0.86765,
  pky6: 0.69677,
  pky7: -0.03077,
  eGamma: -15.815,
  ct: 1.0917,
  qbz1: 10.486,
  qbz2: -0.001154,
  qbz5: -0.68973,
  qbz6: 1.0411,
  qbz9: 27.445,
  qbz10: -1.0792,
  qdz1: 0.19796,
  qdz2: 0.06563,
  qdz3: 0.2199,
  qdz4: 0.21866,
  qdz8: 0.3682,
  qdz9: 0.1218,
  qdz10: 0.25439,
  qdz11: -0.17873,
  qez1: -0.91586,
  qez2: 0.11625,
  qez5: 1.4387,
  qhz3: -0.003789,
  qhz4: -0.01557,
  ...COMBINED,
  relaxation: [8.633e-6, 3.725e-8, 8.389e-10],
};

/**
 * Rear 180/55 ZR17 sport tyre (Sharp, Evangelou & Limebeer 2004, Tables II–III bottom rows; pDx1 = 1.355,
 * pDx2 = −0.0603, §4.5; relaxation §4.8).
 */
export const SPORT_REAR_180_55_ZR17: Readonly<MotorcycleTireCoefficients> = {
  fz0: 1600,
  crownRadius: 0.09,
  ...LONGITUDINAL_160_70,
  pdx1: 1.355,
  pdx2: -0.0603,
  cy: 0.9,
  pdy1: 1.3,
  pdy2: 0,
  pdy3: 0,
  pey1: -2.2227,
  pey2: -1.669,
  pey4: -4.288,
  pky1: 15.791,
  pky2: 1.6935,
  pky3: 1.4604,
  pky4: 0.669,
  pky5: 0.18708,
  cGamma: 0.61397,
  pky6: 0.45512,
  pky7: 0.013293,
  eGamma: -19.99,
  ct: 1.3153,
  qbz1: 10.041,
  qbz2: -1.61e-8,
  qbz5: -0.76784,
  qbz6: 0.73422,
  qbz9: 16.39,
  qbz10: -0.35549,
  qdz1: 0.26331,
  qdz2: 0.030987,
  qdz3: -0.62013,
  qdz4: 0.98524,
  qdz8: 0.50453,
  qdz9: 0.36312,
  qdz10: -0.19168,
  qdz11: -0.40709,
  qez1: -0.19924,
  qez2: -0.017638,
  qez5: 3.6511,
  qhz3: -0.028448,
  qhz4: -0.009862,
  ...COMBINED,
  relaxation: [9.694e-6, -1.333e-8, 1.898e-9],
};

/** Inputs to {@link motorcycleMagicFormula}, ISO-W axes (x forward, y left, z up). */
export interface MotorcycleTireInput {
  /** Longitudinal slip κ, positive driving. */
  kappa: number;
  /** Slip angle α, rad, positive when the contact moves left. */
  alpha: number;
  /** Inclination γ, rad, positive with the wheel top leaning toward −y (leaning right). */
  gamma: number;
  /** Vertical load, N; `≤ 0` gives no force. */
  fz: number;
}

/** Forces and moment from {@link motorcycleMagicFormula}, ISO-W axes, at the contact point. */
export interface MotorcycleTireOutput {
  fx: number;
  /** Side force, N: negative for positive α or γ (it pushes toward the lean and against the slip). */
  fy: number;
  /** Aligning plus camber twisting moment about the vertical, N·m. */
  mz: number;
  /** Cornering stiffness Kyα at this load and camber, N/rad (positive). */
  kya: number;
  /** Camber stiffness Kyγ, N/rad. */
  kyg: number;
  /** Longitudinal slip stiffness Kxκ, N. */
  kxk: number;
  /** Lateral relaxation length at speed `v`, m (only when `v` is given). */
  relaxationLength: number;
}

function sign(x: number): number {
  return x < 0 ? -1 : 1;
}

function shape(b: number, c: number, e: number, x: number): number {
  const bx = b * x;
  return c * Math.atan(bx - e * (bx - Math.atan(bx)));
}

/** Pure side force in Sharp et al.'s sign convention (positive for positive β and γ), Eqs. (7)–(13). */
function sideForce(p: Readonly<MotorcycleTireCoefficients>, fz: number, dfz: number, beta: number, gamma: number): { fy: number; kya: number; kyg: number } {
  const g2 = gamma * gamma;
  const dy = (fz * p.pdy1 * Math.exp(p.pdy2 * dfz)) / (1 + p.pdy3 * g2);
  const ey = p.pey1 + p.pey2 * g2 + p.pey4 * gamma * sign(beta);
  const kya = (p.pky1 * p.fz0 * Math.sin(p.pky2 * Math.atan(fz / ((p.pky3 + p.pky4 * g2) * p.fz0)))) / (1 + p.pky5 * g2);
  const by = kya / (p.cy * dy);
  const kyg = (p.pky6 + p.pky7 * dfz) * fz;
  const bg = kyg / (p.cGamma * dy);
  const fy = dy * Math.sin(shape(by, p.cy, ey, beta) + shape(bg, p.cGamma, p.eGamma, gamma));
  return { fy, kya, kyg };
}

/**
 * The steady-state motorcycle Magic Formula of Sharp, Evangelou & Limebeer (2004), Eqs. (1)–(31): pure and combined
 * longitudinal and side slip with camber thrust as its own term, load-dependent stiffnesses, and an aligning moment
 * from pneumatic trail on the zero-camber side force plus a camber twisting moment (residual torque Dr). The
 * overturning moment is not here: it comes from the contact point moving across the tyre's round crown, which the
 * vehicle's contact geometry carries. Sign convention: ISO-W, so the published formula (positive force for positive
 * slip and camber) is mirrored. The published fit has one shift (rBy3) that would make left and right differ; it
 * is applied to |β| so the tyre stays symmetric as the paper intends.
 * @capability motorcycle-tire motorcycle Magic Formula tyre with camber thrust, combined slip and aligning/twisting moment (Sharp, Evangelou & Limebeer 2004)
 */
export function motorcycleMagicFormula(p: Readonly<MotorcycleTireCoefficients>, input: MotorcycleTireInput, v?: number): MotorcycleTireOutput {
  const fz = input.fz;
  if (!(fz > 0)) return { fx: 0, fy: 0, mz: 0, kya: 0, kyg: 0, kxk: 0, relaxationLength: 0 };
  const dfz = (fz - p.fz0) / p.fz0;
  const kappa = input.kappa;
  const alpha = Math.max(-1.5, Math.min(1.5, input.alpha));
  const beta = Math.tan(alpha);
  const gamma = input.gamma;
  const g2 = gamma * gamma;

  // Pure longitudinal (1)–(6).
  const dx = (p.pdx1 + p.pdx2 * dfz) * fz;
  const ex = Math.min(1, (p.pex1 + p.pex2 * dfz + p.pex3 * dfz * dfz) * (1 - p.pex4 * sign(kappa)));
  const kxk = fz * (p.pkx1 + p.pkx2 * dfz) * Math.exp(p.pkx3 * dfz);
  const bx = kxk / (p.cx * dx);
  const fx0 = dx * Math.sin(shape(bx, p.cx, ex, kappa));
  // Pure side (7)–(13) and its zero-camber part for the trail.
  const pure = sideForce(p, fz, dfz, beta, gamma);
  const pureFlat = sideForce(p, fz, dfz, beta, 0);
  // Combined (23)–(26), (28).
  const bxa = p.rbx1 * Math.cos(Math.atan(p.rbx2 * kappa));
  const fx = Math.cos(p.cxa * Math.atan(bxa * beta)) * fx0;
  const byk = p.rby1 * Math.cos(Math.atan(p.rby2 * (Math.abs(beta) - p.rby3)));
  const gyk = Math.cos(p.cyk * Math.atan(byk * kappa));
  const fy = gyk * pure.fy;
  const fyFlat = gyk * pureFlat.fy;
  // Aligning moment (14)–(22), (27)–(31).
  const bt = (p.qbz1 + p.qbz2 * dfz) * (1 + p.qbz5 * Math.abs(gamma) + p.qbz6 * g2);
  const dt = fz * (p.crownRadius / p.fz0) * (p.qdz1 + p.qdz2 * dfz) * (1 + p.qdz3 * Math.abs(gamma) + p.qdz4 * g2);
  const et = (p.qez1 + p.qez2 * dfz) * (1 + p.qez5 * gamma * (2 / Math.PI) * Math.atan(bt * p.ct * beta));
  const flatKya = pureFlat.kya;
  const dyFlat = fz * p.pdy1 * Math.exp(p.pdy2 * dfz);
  const byFlat = flatKya / (p.cy * dyFlat);
  const br = p.qbz9 + p.qbz10 * byFlat * p.cy;
  const cosBeta = 1 / Math.sqrt(1 + beta * beta);
  const dr = fz * p.crownRadius * ((p.qdz8 + p.qdz9 * dfz) * gamma + (p.qdz10 + p.qdz11 * dfz) * gamma * Math.abs(gamma)) * cosBeta;
  const shr = (p.qhz3 + p.qhz4 * dfz) * gamma;
  const stretch = ((kxk * kappa) / flatKya) ** 2;
  const lt = Math.sqrt(beta * beta + stretch) * sign(beta);
  const lr = Math.sqrt((beta + shr) ** 2 + stretch) * sign(beta + shr);
  const btl = bt * lt;
  const mzt = -dt * Math.cos(p.ct * Math.atan(btl - et * (btl - Math.atan(btl)))) * cosBeta * fyFlat;
  const mzr = dr * Math.cos(Math.atan(br * lr));
  const speed = v === undefined ? 0 : Math.abs(v);
  const relaxationLength = v === undefined ? 0 : pure.kya * (p.relaxation[0] + p.relaxation[1] * speed + p.relaxation[2] * speed * speed);
  return { fx, fy: -fy, mz: -(mzt + mzr), kya: pure.kya, kyg: pure.kyg, kxk, relaxationLength };
}
