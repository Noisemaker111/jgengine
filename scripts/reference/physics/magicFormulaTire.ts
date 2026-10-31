const TNO_VALUES = {
  // [MODEL], [DIMENSION], [INERTIA]
  longvl: 16.7,
  vxlow: 1,
  unloadedRadius: 0.3135,
  rimRadius: 0.1905,
  iyy: 0.736,
  // [OPERATING_CONDITIONS]
  inflpres: 220000,
  nompres: 220000,
  // [VERTICAL]
  fnomin: 4000,
  verticalStiffness: 209651.5,
  verticalDamping: 500,
  breff: 8.39,
  dreff: 0.2587,
  freff: 0.07355,
  qRe0: 0.9974,
  qV1: 7.724e-4,
  qV2: 0.04663,
  qFz2: 15.416,
  qFcx: 0.13682,
  qFcy: 0.1078,
  pfz1: 0.7097,
  bottomOffst: 0.01,
  bottomStiff: 2000000,
  // [STRUCTURAL]
  longitudinalStiffness: 381913.4,
  lateralStiffness: 157632.5,
  pcfx1: 0.18677,
  pcfx2: 0,
  pcfx3: 0,
  pcfy1: 0.16365,
  pcfy2: 0,
  pcfy3: 0.24993,
  // [VERTICAL_FORCE_RANGE]
  fzmin: 100,
  // [SCALING_COEFFICIENTS]
  lfzo: 1,
  lcx: 1,
  lmux: 1,
  lex: 1,
  lkx: 1,
  lhx: 1,
  lvx: 1,
  lcy: 1,
  lmuy: 1,
  ley: 1,
  lky: 1,
  lkyc: 1,
  lkzc: 1,
  lhy: 1,
  lvy: 1,
  ltr: 1,
  lres: 1,
  lxal: 1,
  lyka: 1,
  lvyka: 1,
  ls: 1,
  lmx: 1,
  lvmx: 1,
  lmy: 1,
  lmp: 1,
  // [LONGITUDINAL_COEFFICIENTS]
  pcx1: 1.579,
  pdx1: 1.0422,
  pdx2: -0.0827,
  pdx3: 0,
  pex1: 0.11185,
  pex2: 0.3127,
  pex3: 0,
  pex4: 0.001603,
  pkx1: 21.69,
  pkx2: 13.774,
  pkx3: -0.4119,
  phx1: 2.1585e-4,
  phx2: 0.0011538,
  pvx1: 1.5973e-5,
  pvx2: 1.043e-4,
  ppx1: -0.3489,
  ppx2: 0.382,
  ppx3: -0.09634,
  ppx4: 0.06447,
  rbx1: 12.531,
  rbx2: 9.532,
  rbx3: 0,
  rcx1: 1.019,
  rex1: -0.4487,
  rex2: -0.4726,
  rhx1: 2.374e-4,
  // [OVERTURNING_COEFFICIENTS]
  qsx1: -0.007773,
  qsx2: 0.9557,
  qsx3: 0.01587,
  qsx4: 0.1244,
  qsx5: 1.016,
  qsx6: 20,
  qsx7: 0.3059,
  qsx8: -0.04331,
  qsx9: 0.6269,
  qsx10: 0.14217,
  qsx11: 0.3477,
  qsx12: 0,
  qsx13: 0,
  qsx14: 0,
  ppmx1: 0,
  // [LATERAL_COEFFICIENTS]
  pcy1: 1.3332,
  pdy1: 0.8784,
  pdy2: -0.06445,
  pdy3: 0,
  pey1: -0.8227,
  pey2: -0.6062,
  pey3: 0.09825,
  pey4: -6.546,
  pey5: 0,
  pky1: -15.314,
  pky2: 1.7044,
  pky3: 0.36986,
  pky4: 1.9896,
  pky5: 0,
  pky6: -0.9004,
  pky7: -0.2328,
  phy1: -0.0018043,
  phy2: 0.003518,
  pvy1: -0.006642,
  pvy2: 0.03597,
  pvy3: -0.1621,
  pvy4: -0.4908,
  ppy1: -0.6249,
  ppy2: -0.06535,
  ppy3: -0.1668,
  ppy4: 0.2834,
  ppy5: 0,
  rby1: 10.615,
  rby2: 7.705,
  rby3: 3.433e-6,
  rby4: 0,
  rcy1: 1.0585,
  rey1: 0.3132,
  rey2: 7.63e-6,
  rhy1: 0.011646,
  rhy2: 7.63e-6,
  rvy1: 0.05654,
  rvy2: 7.63e-6,
  rvy3: 0,
  rvy4: 99.9,
  rvy5: 2,
  rvy6: 15.814,
  // [ROLLING_COEFFICIENTS]
  qsy1: 0.00702,
  qsy2: 0,
  qsy3: 0.001515,
  qsy4: 8.514e-5,
  qsy5: 0,
  qsy6: 0,
  qsy7: 0.9008,
  qsy8: -0.4089,
  // [ALIGNING_COEFFICIENTS]
  qbz1: 11.692,
  qbz2: -1.3225,
  qbz3: 0,
  qbz4: 0.17595,
  qbz5: -0.16048,
  qbz9: 29.736,
  qbz10: 0,
  qcz1: 1.2793,
  qdz1: 0.08993,
  qdz2: -0.005979,
  qdz3: 0.3787,
  qdz4: 0,
  qdz6: 0.0016198,
  qdz7: -0.0021103,
  qdz8: -0.1404,
  qdz9: 0.008132,
  qdz10: 0,
  qdz11: 0,
  qez1: -2.17,
  qez2: 1.0036,
  qez3: 0,
  qez4: 0.2795,
  qez5: -0.5441,
  qhz1: 0.0015093,
  qhz2: 0.0020433,
  qhz3: 0.23785,
  qhz4: -0.2069,
  ppz1: -0.4402,
  ppz2: 0,
  ssz1: 0.00918,
  ssz2: 0.03853,
  ssz3: 0,
  ssz4: 0,
  // [TURNSLIP_COEFFICIENTS]
  pdxp1: 0.4,
  pdxp2: 0,
  pdxp3: 0,
  pkyp1: 1,
  pdyp1: 0.4,
  pdyp2: 0,
  pdyp3: 0,
  pdyp4: 0,
  phyp1: 1,
  phyp2: 0.15,
  phyp3: 0,
  phyp4: -4,
  pecp1: 0.5,
  pecp2: 0,
  qdtp1: 10,
  qcrp1: 0.2,
  qcrp2: 0.1,
  qbrp1: 0.1,
  qdrp1: 1,
};

/**
 * Pacejka Magic Formula 6.1 coefficients, named after the keys of a TNO `.tir` property file in camelCase
 * (`PCX1` → `pcx1`, `UNLOADED_RADIUS` → `unloadedRadius`, `Q_FZ2` → `qFz2`). SI units: m, N, rad, kg, s, Pa.
 * {@link parseTirFile} reads a `.tir` file into this shape.
 */
export type MagicFormulaCoefficients = typeof TNO_VALUES;

/**
 * The TNO 205/60 R15 passenger-car tyre (`TNO_car205_60R15.tir`, MF-Tyre/MF-Swift 6.2 fit, Delft-Tyre 2013), the
 * parameter set listed in Pacejka, *Tire and Vehicle Dynamics*, 3rd ed. (2012), Appendix 3. Dry asphalt, 2.2 bar,
 * 4000 N nominal load: μx ≈ 1.04, μy ≈ 0.88, cornering stiffness ≈ 53 kN/rad at nominal load. A left tyre
 * (`TYRESIDE = 'Left'`); {@link createMagicFormulaTire} mirrors it for the right side.
 */
export const TNO_205_60R15: Readonly<MagicFormulaCoefficients> = TNO_VALUES;

function camelKey(name: string): string {
  const parts = name.toLowerCase().split("_").filter((part) => part.length > 0);
  return parts.map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1))).join("");
}

function isCoefficientKey(key: string): key is keyof MagicFormulaCoefficients {
  return Object.prototype.hasOwnProperty.call(TNO_VALUES, key);
}

/**
 * Read a TNO/ADAMS `.tir` property file into {@link MagicFormulaCoefficients}. Keys the file leaves out keep the
 * value from `base` (default {@link TNO_205_60R15}), so a partial file still yields a complete set.
 * @capability tir-file read a TNO/ADAMS .tir tyre property file into Magic Formula coefficients
 */
export function parseTirFile(text: string, base: Readonly<MagicFormulaCoefficients> = TNO_205_60R15): MagicFormulaCoefficients {
  const out: MagicFormulaCoefficients = { ...base };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("$")[0] ?? "";
    const match = /^\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*([-+0-9.eE]+)\s*$/.exec(line);
    if (match === null) continue;
    const key = camelKey(match[1] ?? "");
    const value = Number(match[2]);
    if (isCoefficientKey(key) && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

/** One steady-state evaluation of {@link magicFormula}. Angles in rad, ISO-W axes (x forward, y left, z up). */
export interface MagicFormulaInput {
  /** Longitudinal slip κ = −Vsx/|Vcx|; positive drives. */
  kappa: number;
  /** Slip angle α, rad, `tan α = Vcy/|Vcx|`; positive when the contact patch moves left. */
  alpha: number;
  /** Inclination γ, rad, a rotation about +x: positive tilts the top of the wheel toward −y. */
  gamma: number;
  /** Vertical load, N; `≤ 0` returns zero force. */
  fz: number;
  /** Longitudinal speed of the wheel centre, m/s (default `LONGVL`). Sets rolling resistance, low-speed shifts and reversing. */
  vx?: number;
  /** Inflation pressure, Pa (default the file's `INFLPRES`). */
  pressure?: number;
  /** Spin slip φ, 1/m, from {@link magicFormulaSpinSlip}. Giving `phi` or `phit` turns on the turn-slip equations. */
  phi?: number;
  /** Turn slip φt, 1/m: path curvature, positive turning left. */
  phit?: number;
}

/** Forces and moments from {@link magicFormula}, in the tyre's ISO-W axes. */
export interface MagicFormulaOutput {
  /** Longitudinal force, N. */
  fx: number;
  /** Lateral force, N; opposes positive `alpha` (negative cornering stiffness, as in the TNO convention). */
  fy: number;
  /** Self-aligning moment, N·m. */
  mz: number;
  /** Overturning moment, N·m. */
  mx: number;
  /** Rolling-resistance moment, N·m; opposes the wheel's spin. */
  my: number;
  /** Pneumatic trail, m. */
  trail: number;
  /** Pure-slip longitudinal slip stiffness `∂Fx/∂κ` at κ = 0, N. */
  kxk: number;
  /** Pure-slip cornering stiffness `∂Fy/∂α` at α = 0, N/rad (negative). */
  kya: number;
  /** Peak friction coefficients at this load. */
  mux: number;
  muy: number;
}

const ZERO_OUTPUT: Readonly<MagicFormulaOutput> = { fx: 0, fy: 0, mz: 0, mx: 0, my: 0, trail: 0, kxk: 0, kya: 0, mux: 0, muy: 0 };
const EPS = 1e-6;

function sign(value: number): number {
  return value < 0 ? -1 : 1;
}

function magic(b: number, c: number, d: number, e: number, x: number): number {
  const bx = b * x;
  return d * Math.sin(c * Math.atan(bx - e * (bx - Math.atan(bx))));
}

function cosMagic(b: number, c: number, e: number, x: number): number {
  const bx = b * x;
  return Math.cos(c * Math.atan(bx - e * (bx - Math.atan(bx))));
}

/** Pressure-corrected vertical stiffness `Cz·(1 + PFZ1·dpi)`, N/m. */
function verticalStiffnessAt(p: Readonly<MagicFormulaCoefficients>, pressure: number): number {
  return p.verticalStiffness * (1 + (p.pfz1 * (pressure - p.nompres)) / p.nompres);
}

/** Cornering stiffness (4.E25) without the turn-slip factor. */
function corneringStiffness(p: Readonly<MagicFormulaCoefficients>, fz: number, gammaStar: number, dpi: number): number {
  const fz0 = p.fnomin * p.lfzo;
  return (
    p.pky1 *
    fz0 *
    (1 + p.ppy1 * dpi) *
    (1 - p.pky3 * Math.abs(gammaStar)) *
    Math.sin(p.pky4 * Math.atan(fz / fz0 / ((p.pky2 + p.pky5 * gammaStar * gammaStar) * (1 + p.ppy2 * dpi)))) *
    p.lky
  );
}

/** Longitudinal slip stiffness (4.E15). */
function slipStiffness(p: Readonly<MagicFormulaCoefficients>, fz: number, dfz: number, dpi: number): number {
  return fz * (p.pkx1 + p.pkx2 * dfz) * Math.exp(p.pkx3 * dfz) * (1 + p.ppx1 * dpi + p.ppx2 * dpi * dpi) * p.lkx;
}

/**
 * Spin slip φ and turn slip φt (Pacejka 2012 §4.3.3, Eqs. 4.75–4.76 written for ISO yaw), 1/m, for
 * {@link MagicFormulaInput}: `φt = ψ̇/Vc` and `φ = (ψ̇ + (1 − εγ)·Ω·sin γ)/Vc`, where εγ = `PECP1·(1 + PECP2·dfz)` is the
 * share of camber that does not act as spin. A wheel leaning into a turn at its own rolling-cone curvature has φ ≈ 0.
 * `Vc` is floored at `VXLOW`.
 * @capability tire-spin-slip spin and turn slip of a yawing, cambered wheel for the Magic Formula turn-slip terms
 */
export function magicFormulaSpinSlip(
  p: Readonly<MagicFormulaCoefficients>,
  input: { yawRate: number; spin: number; gamma: number; vx: number; vy?: number; fz: number },
): { phi: number; phit: number } {
  const fz0 = p.fnomin * p.lfzo;
  const dfz = (Math.max(0, input.fz) - fz0) / fz0;
  const epsGamma = p.pecp1 * (1 + p.pecp2 * dfz);
  const vc = Math.max(Math.hypot(input.vx, input.vy ?? 0), p.vxlow);
  return { phit: input.yawRate / vc, phi: (input.yawRate + (1 - epsGamma) * input.spin * Math.sin(input.gamma)) / vc };
}

/**
 * The Magic Formula 6.1 steady-state tyre (Pacejka 2012, §4.3.2–4.3.3 and Appendix 3; MF-Tyre 6.1 as in Besselink,
 * Schmeitz and Pacejka 2010): pure longitudinal and lateral slip with load, camber and inflation-pressure dependence;
 * combined slip through the weighting functions Gxα and Gyκ and the κ-induced side force SVyκ; aligning moment from
 * pneumatic trail on the γ = 0 side force, residual torque and the Fx moment arm; overturning moment; rolling
 * resistance; and, when `phi`/`phit` are given, turn and spin slip (ζ0–ζ8) including the parking torque. Below
 * `VXLOW` the curve shifts fade out so a standing wheel carries no offset force. Pure and allocation-light; call it
 * once per wheel per step.
 * @capability magic-formula-tire evaluate a published Pacejka Magic Formula 6.1 tire — combined slip, load, camber, pressure, turn slip, Fx Fy Mx My Mz
 */
export function magicFormula(p: Readonly<MagicFormulaCoefficients>, input: MagicFormulaInput): MagicFormulaOutput {
  const fz = input.fz;
  if (!(fz > 0)) return { ...ZERO_OUTPUT };
  const r0 = p.unloadedRadius;
  const fz0 = p.fnomin * p.lfzo;
  const dfz = (fz - fz0) / fz0;
  const pressure = input.pressure ?? p.inflpres;
  const dpi = (pressure - p.nompres) / p.nompres;
  const vx = input.vx ?? p.longvl;
  const sVx = sign(vx);
  const alpha = Math.max(-1.55, Math.min(1.55, input.alpha));
  const tanAlpha = Math.tan(alpha);
  const alphaStar = tanAlpha * sVx;
  const gamma = input.gamma;
  const gammaStar = Math.sin(gamma);
  // Rolling backward is the tyre turned about z: slips are taken in its own forward frame (κ*, α*) and forces turned back.
  const kappa = input.kappa * sVx;
  const vc = Math.hypot(vx, tanAlpha * Math.abs(vx));
  const cosAlphaPrime = vx / (vc + EPS);
  const smooth = Math.abs(vx) < p.vxlow ? 0.5 * (1 - Math.cos((Math.PI * vx) / p.vxlow)) : 1;
  const turn = input.phi !== undefined || input.phit !== undefined;
  const phi = input.phi ?? 0;
  const phit = input.phit ?? 0;
  const epsGamma = turn ? p.pecp1 * (1 + p.pecp2 * dfz) : 0;

  // Pure longitudinal slip (4.E9–4.E18), spin reduction ζ1 (4.105).
  const zeta1 = turn ? Math.cos(Math.atan(p.pdxp1 * (1 + p.pdxp2 * dfz) * Math.cos(Math.atan(p.pdxp3 * kappa)) * r0 * phi)) : 1;
  const cx = p.pcx1 * p.lcx;
  const mux = (p.pdx1 + p.pdx2 * dfz) * (1 + p.ppx3 * dpi + p.ppx4 * dpi * dpi) * (1 - p.pdx3 * gamma * gamma) * p.lmux;
  const dx = mux * fz * zeta1;
  const kxk = slipStiffness(p, fz, dfz, dpi);
  const bx = kxk / (cx * dx + EPS * sign(dx));
  const shx = (p.phx1 + p.phx2 * dfz) * p.lhx * smooth;
  const svx = fz * (p.pvx1 + p.pvx2 * dfz) * p.lvx * p.lmux * zeta1 * smooth;
  const kx = kappa + shx;
  const ex = Math.min(1, (p.pex1 + p.pex2 * dfz + p.pex3 * dfz * dfz) * (1 - p.pex4 * sign(kx)) * p.lex);
  const fx0 = (magic(bx, cx, dx, ex, kx) + svx) * sVx;

  // Pure lateral slip (4.E19–4.E30), spin reductions ζ2, ζ3 (4.77–4.79) and the spin shift ζ4 (4.80–4.88).
  const r0Phi = r0 * Math.abs(phi);
  const zeta2 = turn
    ? Math.cos(Math.atan(p.pdyp1 * (1 + p.pdyp2 * dfz) * Math.cos(Math.atan(p.pdyp3 * tanAlpha)) * (r0Phi + p.pdyp4 * Math.sqrt(r0Phi))))
    : 1;
  const zeta3 = turn ? Math.cos(Math.atan(p.pkyp1 * r0 * r0 * phi * phi)) : 1;
  const zeta0 = turn ? 0 : 1;
  const kya = corneringStiffness(p, fz, gammaStar, dpi) * zeta3;
  const kyaP = kya + EPS * sign(kya);
  const svyg = fz * (p.pvy3 + p.pvy4 * dfz) * gammaStar * p.lkyc * p.lmuy * zeta2;
  const kyg0 = fz * (p.pky6 + p.pky7 * dfz) * (1 + p.ppy5 * dpi) * p.lkyc;
  let zeta4 = 1;
  if (turn) {
    const kya0 = corneringStiffness(p, fz, 0, dpi) * zeta3;
    const kya0P = kya0 + EPS * sign(kya0);
    const chyp = p.phyp1;
    const dhyp = (p.phyp2 + p.phyp3 * dfz) * sVx;
    const ehyp = Math.min(1, p.phyp4);
    const bhyp = kyg0 / (1 - epsGamma) / (chyp * dhyp * kya0P);
    const shyp = magic(bhyp, chyp, dhyp, ehyp, r0 * phi) * sVx;
    zeta4 = 1 + shyp - svyg / kyaP;
  }
  const shy = ((p.phy1 + p.phy2 * dfz) * p.lhy + ((kyg0 * gammaStar - svyg) / kyaP) * zeta0 + zeta4 - 1) * smooth;
  const svy = (fz * (p.pvy1 + p.pvy2 * dfz) * p.lvy * p.lmuy * zeta2 + svyg) * smooth;
  const ay = alphaStar + shy;
  const cy = p.pcy1 * p.lcy;
  const muy = (p.pdy1 + p.pdy2 * dfz) * (1 + p.ppy3 * dpi + p.ppy4 * dpi * dpi) * (1 - p.pdy3 * gammaStar * gammaStar) * p.lmuy;
  const dy = muy * fz * zeta2;
  const ey = Math.min(1, (p.pey1 + p.pey2 * dfz) * (1 + p.pey5 * gammaStar * gammaStar - (p.pey3 + p.pey4 * gammaStar) * sign(ay)) * p.ley);
  const by = kya / (cy * dy + EPS * sign(dy));
  const fy0 = (magic(by, cy, dy, ey, ay) + svy) * sVx;

  // Combined slip (4.E50–4.E67).
  const exa = Math.min(1, p.rex1 + p.rex2 * dfz);
  const bxa = (p.rbx1 + p.rbx3 * gammaStar * gammaStar) * Math.cos(Math.atan(p.rbx2 * kappa)) * p.lxal;
  const gxa = cosMagic(bxa, p.rcx1, exa, alphaStar + p.rhx1) / cosMagic(bxa, p.rcx1, exa, p.rhx1);
  const fx = gxa * fx0;

  const dvyk = muy * fz * (p.rvy1 + p.rvy2 * dfz + p.rvy3 * gammaStar) * Math.cos(Math.atan(p.rvy4 * alphaStar)) * zeta2;
  const svyk = dvyk * Math.sin(p.rvy5 * Math.atan(p.rvy6 * kappa)) * p.lvyka * smooth;
  const shyk = p.rhy1 + p.rhy2 * dfz;
  const eyk = Math.min(1, p.rey1 + p.rey2 * dfz);
  const byk = (p.rby1 + p.rby4 * gammaStar * gammaStar) * Math.cos(Math.atan(p.rby2 * (alphaStar - p.rby3))) * p.lyka;
  const gyk = cosMagic(byk, p.rcy1, eyk, kappa + shyk) / cosMagic(byk, p.rcy1, eyk, shyk);
  const fy = gyk * fy0 + svyk * sVx;

  // Aligning moment (4.E31–4.E49, 4.E71–4.E78), turn-slip factors ζ5–ζ8 (4.91–4.103). Mz takes Fz no lower than FZMIN.
  const fzMz = Math.max(fz, p.fzmin);
  const shf = shy + svy / kyaP;
  const alphaR = alphaStar + shf;
  const sht = p.qhz1 + p.qhz2 * dfz + (p.qhz3 + p.qhz4 * dfz) * gammaStar;
  const alphaT = alphaStar + sht;
  const zeta5 = turn ? Math.cos(Math.atan(p.qdtp1 * r0 * phi)) : 1;
  const bt = (p.qbz1 + p.qbz2 * dfz + p.qbz3 * dfz * dfz) * (1 + p.qbz4 * gamma + p.qbz5 * Math.abs(gamma)) * (p.lky / p.lmuy);
  const ct = p.qcz1;
  const dt = (p.qdz1 + p.qdz2 * dfz) * (1 - p.ppz1 * dpi) * (1 + p.qdz3 * gamma + p.qdz4 * gamma * gamma) * fzMz * (r0 / fz0) * p.ltr * zeta5;
  const et = Math.min(1, (p.qez1 + p.qez2 * dfz + p.qez3 * dfz * dfz) * (1 + (p.qez4 + p.qez5 * gammaStar) * (2 / Math.PI) * Math.atan(bt * ct * alphaT)));
  const zeta6 = turn ? Math.cos(Math.atan(p.qbrp1 * r0 * phi)) : 1;
  const br = (p.qbz9 * (p.lky / p.lmuy) + p.qbz10 * by * cy) * zeta6;
  let cr = 1;
  let zeta8 = 1;
  if (turn) {
    const mzpInf = Math.max(p.qcrp1 * Math.abs(muy) * r0 * fz * Math.sqrt(fz / fz0) * p.lmp, 1e-6);
    const cdrp = p.qdrp1;
    const ddrp = mzpInf / Math.sin(0.5 * Math.PI * cdrp);
    const kzgr0 = fz * r0 * (p.qdz8 + p.qdz9 * dfz + (p.qdz10 + p.qdz11 * dfz) * Math.abs(gamma)) * p.lkzc;
    const bdrp = kzgr0 / (cdrp * ddrp * (1 - epsGamma));
    const drp = ddrp * Math.sin(cdrp * Math.atan(bdrp * r0 * phi));
    const mzp90 = mzpInf * (2 / Math.PI) * Math.atan(p.qcrp2 * r0 * Math.abs(phit)) * gyk;
    cr = (2 / Math.PI) * Math.acos(Math.max(-1, Math.min(1, mzp90 / Math.max(Math.abs(drp), 1e-15))));
    zeta8 = 1 + drp;
  }
  const dr =
    fzMz *
      r0 *
      ((p.qdz6 + p.qdz7 * dfz) * p.lres * zeta2 +
        ((p.qdz8 + p.qdz9 * dfz) * (1 + p.ppz2 * dpi) + (p.qdz10 + p.qdz11 * dfz) * Math.abs(gammaStar)) * gammaStar * p.lkzc * zeta0) *
      p.lmuy *
      sVx *
      Math.cos(alphaStar) +
    zeta8 -
    1;
  const stretch2 = (kxk / kyaP) ** 2 * kappa * kappa;
  const alphaREq = Math.atan(Math.sqrt(Math.tan(alphaR) ** 2 + stretch2)) * sign(alphaR);
  const alphaTEq = Math.atan(Math.sqrt(Math.tan(alphaT) ** 2 + stretch2)) * sign(alphaT);
  const trail = dt * cosMagic(bt, ct, et, alphaTEq) * cosAlphaPrime * p.lfzo * smooth;
  const mzr = dr * Math.cos(cr * Math.atan(br * alphaREq)) * smooth;
  const fyGamma0 = pureLateralAtZeroCamber(p, fz, dfz, dpi, alphaStar, smooth) * sVx;
  const s = r0 * (p.ssz1 + p.ssz2 * (fy / p.fnomin) + (p.ssz3 + p.ssz4 * dfz) * gamma) * p.ls;
  const mz = -trail * gyk * fyGamma0 + mzr + s * fx;

  // Overturning moment (4.E69), rolling resistance (4.E70).
  const fzMx = fz < p.fzmin ? fz * (fz / p.fzmin) ** 2 : fz;
  const fn = p.fnomin;
  const mx =
    r0 *
      fzMx *
      p.lmx *
      (p.qsx1 * p.lvmx -
        p.qsx2 * gamma * (1 + p.ppmx1 * dpi) +
        p.qsx3 * (fy / fn) +
        p.qsx4 * Math.cos(p.qsx5 * Math.atan((p.qsx6 * fzMx) / fn) ** 2) * Math.sin(p.qsx7 * gamma + p.qsx8 * Math.atan((p.qsx9 * fy) / fn)) +
        p.qsx10 * Math.atan((p.qsx11 * fzMx) / fn) * gamma) +
    r0 * p.lmx * (fy * (p.qsx13 + p.qsx14 * Math.abs(gamma)) - fzMx * p.qsx12 * gamma * Math.abs(gamma));
  const my = rollingMoment(p, fz, fx, vx, input.kappa, gamma, pressure);

  return { fx, fy, mz, mx, my, trail, kxk, kya, mux, muy };
}

/** Fy0 at γ = 0 and no turn slip, the side force the pneumatic trail acts on (4.E32, 4.E74). */
function pureLateralAtZeroCamber(p: Readonly<MagicFormulaCoefficients>, fz: number, dfz: number, dpi: number, alphaStar: number, smooth: number): number {
  const kya = corneringStiffness(p, fz, 0, dpi);
  const shy = (p.phy1 + p.phy2 * dfz) * p.lhy * smooth;
  const svy = fz * (p.pvy1 + p.pvy2 * dfz) * p.lvy * p.lmuy * smooth;
  const ay = alphaStar + shy;
  const cy = p.pcy1 * p.lcy;
  const dy = (p.pdy1 + p.pdy2 * dfz) * (1 + p.ppy3 * dpi + p.ppy4 * dpi * dpi) * p.lmuy * fz;
  const ey = Math.min(1, (p.pey1 + p.pey2 * dfz) * (1 - p.pey3 * sign(ay)) * p.ley);
  const by = kya / (cy * dy + EPS * sign(dy));
  return magic(by, cy, dy, ey, ay) + svy;
}

function rollingMoment(p: Readonly<MagicFormulaCoefficients>, fz: number, fx: number, vx: number, kappa: number, gamma: number, pressure: number): number {
  const fn = p.fnomin;
  const fzEff = fz < p.fzmin ? fz * (fz / p.fzmin) : fz;
  const v = vx / p.longvl;
  const magnitude =
    p.unloadedRadius *
    fn *
    p.lmy *
    (p.qsy1 + p.qsy2 * (fx / fn) + p.qsy3 * Math.abs(v) + p.qsy4 * v ** 4 + (p.qsy5 + p.qsy6 * (fzEff / fn)) * gamma * gamma) *
    (fzEff / fn) ** p.qsy7 *
    (pressure / p.nompres) ** p.qsy8;
  // Opposes the wheel's spin, faded in over the first VXLOW of rolling speed Ω·Re = Vx + κ·|Vx|.
  const rolling = vx + kappa * Math.abs(vx);
  return -magnitude * Math.sin((Math.PI / 2) * Math.max(-1, Math.min(1, rolling / p.vxlow)));
}

/**
 * Overall carcass stiffness and first-order relaxation lengths (MF 6.1, Pacejka 2012 §7.2): `σκ = Kxκ/Cx`,
 * `σα = |Kyα|/Cy`, with `Cx`, `Cy` from `LONGITUDINAL_STIFFNESS`/`LATERAL_STIFFNESS` and their load and pressure terms.
 * @capability tire-relaxation-length tyre relaxation lengths and carcass stiffness from a Magic Formula set
 */
export function magicFormulaRelaxation(
  p: Readonly<MagicFormulaCoefficients>,
  fz: number,
  kxk: number,
  kya: number,
  pressure?: number,
): { longitudinal: number; lateral: number; longitudinalStiffness: number; lateralStiffness: number } {
  const fz0 = p.fnomin * p.lfzo;
  const dfz = (Math.max(fz, 0) - fz0) / fz0;
  const dpi = ((pressure ?? p.inflpres) - p.nompres) / p.nompres;
  const cx = p.longitudinalStiffness * (1 + p.pcfx1 * dfz + p.pcfx2 * dfz * dfz) * (1 + p.pcfx3 * dpi);
  const cy = p.lateralStiffness * (1 + p.pcfy1 * dfz + p.pcfy2 * dfz * dfz) * (1 + p.pcfy3 * dpi);
  return { longitudinal: Math.abs(kxk) / cx, lateral: Math.abs(kya) / cy, longitudinalStiffness: cx, lateralStiffness: cy };
}

/**
 * Effective rolling radius, m (MF 6.1, Besselink et al. 2010 Eqs. 1 and 7): the radius that turns wheel spin `Ω` into
 * ground speed. Grows with spin by `Q_V1` and shrinks with load by the `BREFF`/`DREFF`/`FREFF` law on the
 * pressure-corrected vertical stiffness.
 * @capability tire-rolling-radius effective rolling radius of a loaded, spinning tyre
 */
export function magicFormulaRollingRadius(p: Readonly<MagicFormulaCoefficients>, fz: number, spin: number, pressure?: number): number {
  const fn = p.fnomin;
  const r0 = p.unloadedRadius;
  const romega = r0 * (p.qRe0 + p.qV1 * ((spin * r0) / p.longvl) ** 2);
  const load = Math.max(0, fz) / fn;
  return romega - (fn / verticalStiffnessAt(p, pressure ?? p.inflpres)) * (p.dreff * Math.atan(p.breff * load) + p.freff * load);
}

/** Inputs to {@link magicFormulaVerticalForce}. */
export interface MagicFormulaVerticalInput {
  /** Radial tyre deflection ρ, m (free radius minus loaded radius). */
  deflection: number;
  /** Deflection rate, m/s, positive compressing (adds `VERTICAL_DAMPING`). */
  deflectionRate?: number;
  /** Wheel spin Ω, rad/s (stiffens the tyre by `Q_V2`). */
  spin?: number;
  /** Current horizontal forces, N (soften the tyre by `Q_FCX`, `Q_FCY`). */
  fx?: number;
  fy?: number;
  /** Inflation pressure, Pa (default `INFLPRES`). */
  pressure?: number;
}

/**
 * Tyre vertical force, N, from deflection (MF 6.1, Besselink et al. 2010 Eq. 4):
 * `Fz = (1 + qV2·|Ω|R0/V0 − (qFcx·Fx/Fz0)² − (qFcy·Fy/Fz0)²)·(qFz1·ρ/R0 + qFz2·(ρ/R0)²)·(1 + pFz1·dpi)·Fz0`, with
 * `qFz1` set so the stiffness at nominal load equals `VERTICAL_STIFFNESS`. Adds `VERTICAL_DAMPING` on the deflection
 * rate and the MF-Swift bottoming spring once the rim is within `BOTTOM_OFFST`. Never pulls (≥ 0).
 * @capability tire-vertical-force tyre vertical force from deflection with speed, force, pressure and bottoming terms
 */
export function magicFormulaVerticalForce(p: Readonly<MagicFormulaCoefficients>, input: MagicFormulaVerticalInput): number {
  const deflection = input.deflection;
  if (!(deflection > 0)) return 0;
  const fn = p.fnomin;
  const r0 = p.unloadedRadius;
  const dpi = ((input.pressure ?? p.inflpres) - p.nompres) / p.nompres;
  const qFz1 = Math.sqrt(Math.max(0, ((p.verticalStiffness * r0) / fn) ** 2 - 4 * p.qFz2));
  const x = deflection / r0;
  const fx = input.fx ?? 0;
  const fy = input.fy ?? 0;
  const correction = 1 + (p.qV2 * r0 * Math.abs(input.spin ?? 0)) / p.longvl - ((p.qFcx * fx) / fn) ** 2 - ((p.qFcy * fy) / fn) ** 2;
  const bottomAt = r0 - p.rimRadius - p.bottomOffst;
  const bottoming = deflection > bottomAt ? p.bottomStiff * (deflection - bottomAt) : 0;
  const force = correction * (qFz1 * x + p.qFz2 * x * x) * (1 + p.pfz1 * dpi) * fn + p.verticalDamping * (input.deflectionRate ?? 0) + bottoming;
  return Math.max(0, force);
}

/** Options for {@link createMagicFormulaTire}. */
export interface MagicFormulaTireOptions {
  /** Which side of the car; the right tyre mirrors the file's left-hand fit (α, γ, φ, Fy, Mz, Mx). Default `"left"`. */
  side?: "left" | "right";
  /** Evaluate turn and spin slip (default `true`). */
  turnSlip?: boolean;
  /**
   * Low-speed contact damping, s/m: Pacejka's `kVlow0` (2012 §7.2) divided by the slip stiffness. Below `VXLOW` the
   * transient slips gain `−kVlow·Vsx` and `kVlow·Vsy`, faded by a half cosine to zero at `VXLOW`. Default `1/VXLOW`,
   * which matches the rolling contact's own slip definition at `VXLOW`, so the contact behaves alike on both sides of it.
   */
  lowSpeedDamping?: number;
}

/** One {@link MagicFormulaTire.step} input: the wheel's motion in its own ISO-W axes. */
export interface MagicFormulaTireStepInput {
  /** Contact-centre velocity, m/s, forward and leftward in the wheel plane. */
  vx: number;
  vy: number;
  /** Wheel spin Ω, rad/s, positive rolling forward. */
  spin: number;
  /** Vertical load, N. */
  fz: number;
  /** Inclination, rad (ISO; the right tyre takes its own ISO value and is mirrored inside). */
  gamma?: number;
  /** Yaw rate of the wheel plane, rad/s, positive turning left. */
  yawRate?: number;
  /** Inflation pressure, Pa. */
  pressure?: number;
}

/** {@link MagicFormulaTire.step} result: forces and moments plus the lagged slips that produced them. */
export interface MagicFormulaTireStep extends MagicFormulaOutput {
  /** Transient slip ratio and slip angle (rad) after relaxation. */
  kappa: number;
  alpha: number;
  /** Effective rolling radius, m. */
  rollingRadius: number;
}

/** Serializable transient state of a {@link MagicFormulaTire}: contact deflections and the last slip velocities. */
export interface MagicFormulaTireState {
  /** Longitudinal and lateral contact deflection, m, and the lagged spin slip φ′, 1/m. */
  u: number;
  v: number;
  phi: number;
  /** Driving terms from the previous step, for the first-order-hold integrator; `primed` false before the first step. */
  lastU: number;
  lastV: number;
  lastPhi: number;
  primed: boolean;
}

/** A transient Magic Formula tyre: relaxation-length dynamics on top of {@link magicFormula}. */
export interface MagicFormulaTire {
  /** Advance the contact by `dt` seconds and return forces in the wheel's ISO-W axes. */
  step(dt: number, input: MagicFormulaTireStepInput): MagicFormulaTireStep;
  snapshot(): MagicFormulaTireState;
  restore(state: Readonly<MagicFormulaTireState>): void;
  /** Relaxed contact: no deflection. */
  reset(): void;
  readonly coefficients: Readonly<MagicFormulaCoefficients>;
}

/**
 * Exact solution over one step of `dx/dt = −a·x + b(t)` with `b` linear from `b0` to `b1` (first-order hold).
 * Second-order accurate in the inputs and stable for any step, including standstill (`a → 0`).
 */
function holdStep(x: number, a: number, b0: number, b1: number, dt: number): number {
  const z = a * dt;
  let decay: number;
  let f1: number;
  let f2: number;
  if (z < 1e-4) {
    decay = 1 - z + (z * z) / 2;
    f1 = dt * (1 - z / 2 + (z * z) / 6);
    f2 = ((dt * dt) / 2) * (1 - z / 3);
  } else {
    decay = Math.exp(-z);
    f1 = (1 - decay) / a;
    f2 = (dt - f1) / a;
  }
  return decay * x + b0 * f1 + ((b1 - b0) / dt) * f2;
}

/** Relaxation terms of the contact for one wheel motion: `d(state)/dt = drive − decay·state`. */
interface ContactTerms {
  fz: number;
  pressure: number;
  vx: number;
  vy: number;
  gamma: number;
  vsx: number;
  rollingRadius: number;
  sigmaKappa: number;
  sigmaAlpha: number;
  decayU: number;
  decayV: number;
  driveU: number;
  driveV: number;
  drivePhi: number;
  phit: number;
  kVlow: number;
}

function contactTerms(p: Readonly<MagicFormulaCoefficients>, input: MagicFormulaTireStepInput, mirror: number, turnSlip: boolean, damping: number): ContactTerms {
  const fz0 = p.fnomin * p.lfzo;
  const fz = Math.max(0, input.fz);
  const pressure = input.pressure ?? p.inflpres;
  const vx = input.vx;
  const vy = input.vy * mirror;
  const gamma = (input.gamma ?? 0) * mirror;
  const yawRate = (input.yawRate ?? 0) * mirror;
  const rollingRadius = magicFormulaRollingRadius(p, fz, input.spin, pressure);
  const vsx = vx - input.spin * rollingRadius;
  const dpi = (pressure - p.nompres) / p.nompres;
  const loadForStiffness = Math.max(fz, p.fzmin);
  const kxk = slipStiffness(p, loadForStiffness, (loadForStiffness - fz0) / fz0, dpi);
  const kya = corneringStiffness(p, loadForStiffness, Math.sin(gamma), dpi);
  const relax = magicFormulaRelaxation(p, loadForStiffness, kxk, kya, pressure);
  const speed = Math.abs(vx);
  const spinSlip = turnSlip ? magicFormulaSpinSlip(p, { yawRate, spin: input.spin, gamma, vx, vy, fz }) : { phi: 0, phit: 0 };
  return {
    fz,
    pressure,
    vx,
    vy,
    gamma,
    vsx,
    rollingRadius,
    sigmaKappa: relax.longitudinal,
    sigmaAlpha: relax.lateral,
    decayU: speed / relax.longitudinal,
    decayV: speed / relax.lateral,
    driveU: -vsx,
    driveV: vy,
    drivePhi: (speed / relax.lateral) * spinSlip.phi,
    phit: spinSlip.phit,
    kVlow: speed < p.vxlow ? 0.5 * damping * (1 + Math.cos((Math.PI * speed) / p.vxlow)) : 0,
  };
}

function contactForces(p: Readonly<MagicFormulaCoefficients>, terms: ContactTerms, contact: Readonly<MagicFormulaContactState>, mirror: number, turnSlip: boolean): MagicFormulaTireStep {
  const kappa = contact.u / terms.sigmaKappa - terms.kVlow * terms.vsx;
  const alpha = Math.atan(contact.v / terms.sigmaAlpha + terms.kVlow * terms.vy);
  const out =
    terms.fz > 0
      ? magicFormula(p, {
          kappa,
          alpha,
          gamma: terms.gamma,
          fz: terms.fz,
          vx: terms.vx,
          pressure: terms.pressure,
          ...(turnSlip ? { phi: contact.phi, phit: terms.phit } : {}),
        })
      : { ...ZERO_OUTPUT };
  return { ...out, fy: out.fy * mirror, mz: out.mz * mirror, mx: out.mx * mirror, kappa, alpha: alpha * mirror, rollingRadius: terms.rollingRadius };
}

/** Contact deflections of a transient tyre: longitudinal `u` and lateral `v`, m, and lagged spin slip `phi`, 1/m. */
export interface MagicFormulaContactState {
  u: number;
  v: number;
  phi: number;
}

/**
 * The transient contact of {@link createMagicFormulaTire} as a pure right-hand side, for a caller that integrates the
 * deflections itself (a multibody car's ODE): forces from the current deflections and the deflection rates
 * `du/dt = −Vsx − |Vx|·u/σκ`, `dv/dt = Vsy − |Vx|·v/σα`, `dφ′/dt = |Vx|·(φ − φ′)/σα`. Right-tyre states live in the
 * mirrored frame.
 * @capability magic-formula-contact relaxation-length tire contact as a pure ODE right-hand side for a multibody integrator
 */
export function magicFormulaContact(
  coefficients: Readonly<MagicFormulaCoefficients>,
  contact: Readonly<MagicFormulaContactState>,
  input: MagicFormulaTireStepInput,
  options: MagicFormulaTireOptions = {},
): { forces: MagicFormulaTireStep; du: number; dv: number; dphi: number } {
  const p = coefficients;
  const mirror = options.side === "right" ? -1 : 1;
  const turnSlip = options.turnSlip ?? true;
  const terms = contactTerms(p, input, mirror, turnSlip, options.lowSpeedDamping ?? 1 / p.vxlow);
  return {
    forces: contactForces(p, terms, contact, mirror, turnSlip),
    du: terms.driveU - terms.decayU * contact.u,
    dv: terms.driveV - terms.decayV * contact.v,
    dphi: terms.drivePhi - terms.decayV * contact.phi,
  };
}

/**
 * A transient Magic Formula 6.1 tyre (Pacejka 2012 §7.2, the MF-Tyre "linear relaxation" contact): the contact patch
 * deflects by `du/dt = −Vsx − |Vx|·u/σκ` and `dv/dt = Vsy − |Vx|·v/σα` with load- and pressure-dependent relaxation
 * lengths `σ = slip stiffness / carcass stiffness`, and the forces come from the lagged slips `κ′ = u/σκ`,
 * `tan α′ = v/σα` (spin slip lags on σα too). Each step is the exact solution for inputs that change linearly across
 * the step, so it stays stable at standstill and converges at second order as `dt` halves. Below `VXLOW` the contact
 * gains Pacejka's low-speed damping, so a parked car holds still on its tyres' carcass springs. Tyre temperature is
 * not modelled: MF 6.1 has no thermal terms and no thermal parameter set is published for this tyre.
 * @capability magic-formula-tire-transient run a Magic Formula tire with relaxation-length dynamics, standstill-stable, serializable state
 */
export function createMagicFormulaTire(coefficients: Readonly<MagicFormulaCoefficients>, options: MagicFormulaTireOptions = {}): MagicFormulaTire {
  const p = coefficients;
  const mirror = options.side === "right" ? -1 : 1;
  const turnSlip = options.turnSlip ?? true;
  const damping = options.lowSpeedDamping ?? 1 / p.vxlow;
  const state: MagicFormulaTireState = { u: 0, v: 0, phi: 0, lastU: 0, lastV: 0, lastPhi: 0, primed: false };

  function step(dt: number, input: MagicFormulaTireStepInput): MagicFormulaTireStep {
    const terms = contactTerms(p, input, mirror, turnSlip, damping);
    if (!state.primed || !(dt > 0)) {
      state.lastU = terms.driveU;
      state.lastV = terms.driveV;
      state.lastPhi = terms.drivePhi;
      state.primed = true;
    }
    if (dt > 0) {
      state.u = holdStep(state.u, terms.decayU, state.lastU, terms.driveU, dt);
      state.v = holdStep(state.v, terms.decayV, state.lastV, terms.driveV, dt);
      state.phi = holdStep(state.phi, terms.decayV, state.lastPhi, terms.drivePhi, dt);
    }
    state.lastU = terms.driveU;
    state.lastV = terms.driveV;
    state.lastPhi = terms.drivePhi;
    return contactForces(p, terms, state, mirror, turnSlip);
  }

  return {
    step,
    snapshot: () => ({ ...state }),
    restore(next) {
      Object.assign(state, next);
    },
    reset() {
      Object.assign(state, { u: 0, v: 0, phi: 0, lastU: 0, lastV: 0, lastPhi: 0, primed: false });
    },
    coefficients: p,
  };
}
