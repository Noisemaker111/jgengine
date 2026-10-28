import { describe, expect, test } from "bun:test";

import {
  createMagicFormulaTire,
  magicFormula,
  magicFormulaRelaxation,
  magicFormulaRollingRadius,
  magicFormulaSpinSlip,
  magicFormulaVerticalForce,
  parseTirFile,
  TNO_205_60R15 as tire,
} from "./magicFormulaTire";

const FZ0 = tire.fnomin;
const R0 = tire.unloadedRadius;

function relative(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.abs(expected);
}

function peakLateral(fz: number, extra: { phi?: number; pressure?: number } = {}): { force: number; alpha: number } {
  let best = { force: 0, alpha: 0 };
  for (let alpha = 0; alpha < 0.5; alpha += 0.0005) {
    const force = -magicFormula(tire, { kappa: 0, alpha, gamma: 0, fz, ...extra }).fy;
    if (force > best.force) best = { force, alpha };
  }
  return best;
}

function peakLongitudinal(fz: number, extra: { phi?: number } = {}): number {
  let best = 0;
  for (let kappa = 0; kappa < 0.6; kappa += 0.0005) best = Math.max(best, magicFormula(tire, { kappa, alpha: 0, gamma: 0, fz, ...extra }).fx);
  return best;
}

function corneringSlope(fz: number, pressure?: number): number {
  const at = (alpha: number) => magicFormula(tire, { kappa: 0, alpha, gamma: 0, fz, ...(pressure === undefined ? {} : { pressure }) }).fy;
  return (at(0.001) - at(-0.001)) / -0.002;
}

// The published coefficient set defines its characteristic values directly: μ peaks (PDX1, PDY1 and their load and
// pressure terms), cornering stiffness (PKY law) and slip stiffness (PKX1·Fz0). The full formula reproduces them.
describe("magicFormula reproduces the TNO 205/60 R15 characteristic values", () => {
  test("lateral peak at nominal load is μy·Fz less the vertical shift (±1%)", () => {
    expect(relative(peakLateral(FZ0).force, (tire.pdy1 - tire.pvy1) * FZ0)).toBeLessThan(0.01);
  });

  test("lateral friction falls with load by PDY2 (±1%)", () => {
    const fz = 2 * FZ0;
    expect(relative(peakLateral(fz).force, (tire.pdy1 + tire.pdy2 - (tire.pvy1 + tire.pvy2)) * fz)).toBeLessThan(0.01);
  });

  test("cornering stiffness at α → 0 matches the PKY law (±1%)", () => {
    for (const fz of [2000, FZ0, 6000]) {
      const expected = Math.abs(tire.pky1 * FZ0 * Math.sin(tire.pky4 * Math.atan(fz / (tire.pky2 * FZ0))));
      expect(relative(corneringSlope(fz), expected)).toBeLessThan(0.01);
    }
  });

  test("longitudinal slip stiffness and peak friction at nominal load match PKX1 and PDX1 (±1%)", () => {
    const slope = (magicFormula(tire, { kappa: 0.001, alpha: 0, gamma: 0, fz: FZ0 }).fx - magicFormula(tire, { kappa: -0.001, alpha: 0, gamma: 0, fz: FZ0 }).fx) / 0.002;
    expect(relative(slope, tire.pkx1 * FZ0)).toBeLessThan(0.01);
    expect(relative(peakLongitudinal(FZ0), tire.pdx1 * FZ0)).toBeLessThan(0.01);
  });

  test("lateral force peaks between 7° and 12° of slip and keeps most of its force fully sideways", () => {
    const peak = peakLateral(FZ0);
    expect(peak.alpha * (180 / Math.PI)).toBeGreaterThan(7);
    expect(peak.alpha * (180 / Math.PI)).toBeLessThan(12);
    const sliding = -magicFormula(tire, { kappa: 0, alpha: 1.5, gamma: 0, fz: FZ0 }).fy;
    expect(sliding / peak.force).toBeGreaterThan(0.75);
    expect(sliding / peak.force).toBeLessThan(0.95);
  });

  test("inflation pressure scales cornering stiffness and grip by the PPY terms (±1%)", () => {
    const pressure = 2.6e5;
    const dpi = (pressure - tire.nompres) / tire.nompres;
    const stiffness = Math.abs(tire.pky1 * FZ0 * (1 + tire.ppy1 * dpi) * Math.sin(tire.pky4 * Math.atan(1 / (tire.pky2 * (1 + tire.ppy2 * dpi)))));
    expect(relative(corneringSlope(FZ0, pressure), stiffness)).toBeLessThan(0.01);
    const mu = tire.pdy1 * (1 + tire.ppy3 * dpi + tire.ppy4 * dpi * dpi);
    expect(relative(peakLateral(FZ0, { pressure }).force, (mu - tire.pvy1) * FZ0)).toBeLessThan(0.01);
  });
});

describe("magicFormula combined slip, camber and moments", () => {
  test("combined slip stays inside the friction ellipse and each force shrinks under the other slip", () => {
    const fxMax = peakLongitudinal(FZ0);
    const fyMax = peakLateral(FZ0).force;
    for (const kappa of [0.02, 0.05, 0.1, 0.2, 0.5]) {
      for (const alpha of [0.02, 0.05, 0.1, 0.2]) {
        const both = magicFormula(tire, { kappa, alpha, gamma: 0, fz: FZ0 });
        const pureX = magicFormula(tire, { kappa, alpha: 0, gamma: 0, fz: FZ0 }).fx;
        const pureY = magicFormula(tire, { kappa: 0, alpha, gamma: 0, fz: FZ0 }).fy;
        expect(Math.abs(both.fx)).toBeLessThan(Math.abs(pureX));
        expect(Math.abs(both.fy)).toBeLessThan(Math.abs(pureY) + 30);
        expect(Math.hypot(both.fx / fxMax, both.fy / fyMax)).toBeLessThan(1.05);
      }
    }
  });

  test("camber thrust follows the ISO sign: positive inclination pushes toward −y", () => {
    expect(magicFormula(tire, { kappa: 0, alpha: 0, gamma: 0.05, fz: FZ0 }).fy).toBeLessThan(-100);
    expect(magicFormula(tire, { kappa: 0, alpha: 0, gamma: -0.05, fz: FZ0 }).fy).toBeGreaterThan(50);
  });

  test("the aligning moment restores at small slip and its trail collapses past the force peak", () => {
    const small = magicFormula(tire, { kappa: 0, alpha: 0.03, gamma: 0, fz: FZ0 });
    expect(small.mz).toBeGreaterThan(0);
    expect(small.trail).toBeGreaterThan(0.01);
    expect(small.trail).toBeLessThan(0.05);
    const large = magicFormula(tire, { kappa: 0, alpha: 0.25, gamma: 0, fz: FZ0 });
    expect(Math.abs(large.mz)).toBeLessThan(small.mz);
  });

  test("the pneumatic trail at α → 0 is Dt·cos(α′) from QDZ1/QDZ2 (±1%)", () => {
    const out = magicFormula(tire, { kappa: 0, alpha: -tire.qhz1, gamma: 0, fz: FZ0 });
    expect(relative(out.trail, tire.qdz1 * R0)).toBeLessThan(0.01);
  });

  test("rolling resistance moment reproduces QSY1/QSY3/QSY4 at nominal load and speed, and its load and pressure exponents", () => {
    const at = (fz: number, pressure: number) => magicFormula(tire, { kappa: 0, alpha: 0, gamma: 0, fz, vx: tire.longvl, pressure }).my;
    const nominal = -R0 * FZ0 * (tire.qsy1 + tire.qsy3 + tire.qsy4);
    expect(relative(at(FZ0, tire.nompres), nominal)).toBeLessThan(1e-9);
    expect(relative(at(2 * FZ0, tire.nompres) / at(FZ0, tire.nompres), 2 ** tire.qsy7)).toBeLessThan(1e-9);
    expect(relative(at(FZ0, 2 * tire.nompres) / at(FZ0, tire.nompres), 2 ** tire.qsy8)).toBeLessThan(1e-9);
  });

  test("rolling resistance opposes the wheel's spin, reverses when reversing and fades in from standstill", () => {
    expect(magicFormula(tire, { kappa: 0, alpha: 0, gamma: 0, fz: FZ0, vx: 10 }).my).toBeLessThan(0);
    expect(magicFormula(tire, { kappa: 0, alpha: 0, gamma: 0, fz: FZ0, vx: -10 }).my).toBeGreaterThan(0);
    expect(magicFormula(tire, { kappa: 0, alpha: 0, gamma: 0, fz: FZ0, vx: 0 }).my).toBe(-0);
    const creeping = magicFormula(tire, { kappa: 0, alpha: 0, gamma: 0, fz: FZ0, vx: 0.1 * tire.vxlow }).my;
    const rolling = magicFormula(tire, { kappa: 0, alpha: 0, gamma: 0, fz: FZ0, vx: tire.vxlow }).my;
    expect(Math.abs(creeping)).toBeLessThan(0.2 * Math.abs(rolling));
  });

  test("overturning moment leans against camber: positive γ gives negative Mx, growing with γ", () => {
    const base = magicFormula(tire, { kappa: 0, alpha: 0, gamma: 0, fz: FZ0 }).mx;
    const small = magicFormula(tire, { kappa: 0, alpha: 0, gamma: 0.02, fz: FZ0 }).mx - base;
    const large = magicFormula(tire, { kappa: 0, alpha: 0, gamma: 0.05, fz: FZ0 }).mx - base;
    expect(small).toBeLessThan(0);
    expect(large).toBeLessThan(small);
  });

  test("below VXLOW the curve shifts fade out, so a standing tyre at zero slip carries no force", () => {
    const parked = magicFormula(tire, { kappa: 0, alpha: 0, gamma: 0, fz: FZ0, vx: 0 });
    expect(Math.abs(parked.fx)).toBeLessThan(1e-9);
    expect(Math.abs(parked.fy)).toBeLessThan(1e-9);
    expect(Math.abs(magicFormula(tire, { kappa: 0, alpha: 0, gamma: 0, fz: FZ0 }).fy)).toBeGreaterThan(10);
  });

  test("reversing mirrors the slip response", () => {
    const fwd = magicFormula(tire, { kappa: 0.05, alpha: 0, gamma: 0, fz: FZ0, vx: 10 });
    const back = magicFormula(tire, { kappa: 0.05, alpha: 0, gamma: 0, fz: FZ0, vx: -10 });
    expect(relative(back.fx, -fwd.fx)).toBeLessThan(1e-9);
  });

  test("zero load gives zero force", () => {
    expect(magicFormula(tire, { kappa: 0.1, alpha: 0.1, gamma: 0, fz: 0 })).toEqual({ fx: 0, fy: 0, mz: 0, mx: 0, my: 0, trail: 0, kxk: 0, kya: 0, mux: 0, muy: 0 });
  });
});

describe("magicFormula turn slip", () => {
  const vx = 20;
  const spin = vx / magicFormulaRollingRadius(tire, FZ0, vx / R0);

  test("pure camber run through spin slip reproduces the camber force and moment of the plain formula (±3%)", () => {
    for (const gamma of [0.05, -0.05]) {
      for (const alpha of [0, 0.03, 0.08]) {
        const plain = magicFormula(tire, { kappa: 0, alpha, gamma, fz: FZ0, vx });
        const spinning = magicFormula(tire, { kappa: 0, alpha, gamma, fz: FZ0, vx, ...magicFormulaSpinSlip(tire, { yawRate: 0, spin, gamma, vx, fz: FZ0 }) });
        const camberPart = plain.fy - magicFormula(tire, { kappa: 0, alpha, gamma: 0, fz: FZ0, vx }).fy;
        expect(Math.abs(spinning.fy - plain.fy)).toBeLessThan(0.03 * Math.abs(camberPart) + 5);
        expect(Math.abs(spinning.mz - plain.mz)).toBeLessThan(0.05 * Math.abs(plain.mz) + 1.5);
      }
    }
  });

  test("a wheel leaning into a turn at its own rolling-cone curvature keeps only the εγ share of spin", () => {
    const gamma = -0.1;
    const yawRate = -spin * Math.sin(gamma);
    const { phi } = magicFormulaSpinSlip(tire, { yawRate, spin, gamma, vx, fz: FZ0 });
    expect(phi).toBeCloseTo((-tire.pecp1 * spin * Math.sin(gamma)) / vx, 9);
  });

  test("spin reduces peak forces by ζ1 and ζ2 (Eqs. 4.105, 4.77) and the moment resists the turn", () => {
    const phi = 3;
    expect(relative(peakLongitudinal(FZ0, { phi }), peakLongitudinal(FZ0) * Math.cos(Math.atan(tire.pdxp1 * R0 * phi)))).toBeLessThan(0.01);
    expect(relative(peakLateral(FZ0, { phi }).force, peakLateral(FZ0).force * Math.cos(Math.atan(tire.pdyp1 * R0 * phi)))).toBeLessThan(0.02);
    const turning = magicFormula(tire, { kappa: 0, alpha: 0, gamma: 0, fz: FZ0, vx: 2, phi: 2, phit: 2 });
    expect(turning.mz).toBeLessThan(0);
  });

  test("the parking moment saturates toward Mzφ∞ = QCRP1·μy·R0·Fz as turning tightens", () => {
    const limit = tire.qcrp1 * tire.pdy1 * R0 * FZ0;
    const tight = magicFormula(tire, { kappa: 0, alpha: 0, gamma: 0, fz: FZ0, vx: tire.vxlow, phi: 200, phit: 200 }).mz;
    expect(-tight).toBeGreaterThan(0.8 * limit);
    expect(-tight).toBeLessThan(1.05 * limit);
  });
});

describe("vertical load and rolling radius", () => {
  function deflectionFor(fz: number, pressure?: number): number {
    let lo = 0;
    let hi = 0.08;
    for (let i = 0; i < 80; i++) {
      const mid = 0.5 * (lo + hi);
      if (magicFormulaVerticalForce(tire, { deflection: mid, ...(pressure === undefined ? {} : { pressure }) }) < fz) lo = mid;
      else hi = mid;
    }
    return 0.5 * (lo + hi);
  }

  test("vertical stiffness at nominal load equals VERTICAL_STIFFNESS (±0.5%)", () => {
    const rho = deflectionFor(FZ0);
    const h = 1e-6;
    const stiffness = (magicFormulaVerticalForce(tire, { deflection: rho + h }) - magicFormulaVerticalForce(tire, { deflection: rho - h })) / (2 * h);
    expect(relative(stiffness, tire.verticalStiffness)).toBeLessThan(0.005);
  });

  test("pressure stiffens by PFZ1, damping adds on compression, the rim bottoms out", () => {
    const rho = deflectionFor(FZ0);
    const pressure = 1.2 * tire.nompres;
    expect(relative(magicFormulaVerticalForce(tire, { deflection: rho, pressure }), FZ0 * (1 + tire.pfz1 * 0.2))).toBeLessThan(1e-9);
    expect(magicFormulaVerticalForce(tire, { deflection: rho, deflectionRate: 0.1 }) - FZ0).toBeCloseTo(tire.verticalDamping * 0.1, 6);
    const bottom = R0 - tire.rimRadius - tire.bottomOffst;
    const jump = magicFormulaVerticalForce(tire, { deflection: bottom + 0.001 }) - magicFormulaVerticalForce(tire, { deflection: bottom });
    expect(jump).toBeGreaterThan(tire.bottomStiff * 0.001);
    expect(magicFormulaVerticalForce(tire, { deflection: -0.01 })).toBe(0);
  });

  test("effective rolling radius sits below the loaded-radius drop and grows with speed by Q_V1", () => {
    const slow = magicFormulaRollingRadius(tire, FZ0, 1);
    const fast = magicFormulaRollingRadius(tire, FZ0, 150);
    expect(slow).toBeLessThan(R0);
    expect(slow).toBeGreaterThan(R0 - deflectionFor(FZ0));
    expect(fast - slow).toBeCloseTo(R0 * tire.qV1 * ((150 * R0) / tire.longvl) ** 2 - R0 * tire.qV1 * (R0 / tire.longvl) ** 2, 9);
  });
});

describe("createMagicFormulaTire transient contact", () => {
  const vx = 20;
  const spinAt = (speed: number) => speed / magicFormulaRollingRadius(tire, FZ0, speed / R0);

  function sigmaAlpha(): number {
    const steady = magicFormula(tire, { kappa: 0, alpha: 0, gamma: 0, fz: FZ0 });
    return magicFormulaRelaxation(tire, FZ0, steady.kxk, steady.kya).lateral;
  }

  test("relaxation lengths are slip stiffness over carcass stiffness", () => {
    const steady = magicFormula(tire, { kappa: 0, alpha: 0, gamma: 0, fz: FZ0 });
    const relax = magicFormulaRelaxation(tire, FZ0, steady.kxk, steady.kya);
    expect(relax.lateral).toBeCloseTo(Math.abs(steady.kya) / tire.lateralStiffness, 9);
    expect(relax.longitudinal).toBeCloseTo((tire.pkx1 * FZ0) / tire.longitudinalStiffness, 9);
  });

  test("a slip-angle step builds as 1 − e^(−s/σα) over distance rolled (±0.2%)", () => {
    const sigma = sigmaAlpha();
    const tanAlpha = Math.tan(0.02);
    const t = createMagicFormulaTire(tire, { turnSlip: false });
    t.step(0, { vx, vy: tanAlpha * vx, spin: spinAt(vx), fz: FZ0 });
    const dt = 0.001;
    for (let i = 1; i <= 100; i++) {
      const out = t.step(dt, { vx, vy: tanAlpha * vx, spin: spinAt(vx), fz: FZ0 });
      if (i % 10 === 0) {
        const expected = tanAlpha * (1 - Math.exp((-vx * i * dt) / sigma));
        expect(Math.abs(Math.tan(out.alpha) - expected)).toBeLessThan(0.002 * tanAlpha);
      }
    }
  });

  test("the contact integrator converges at second order as the step halves", () => {
    const run = (dt: number) => {
      const t = createMagicFormulaTire(tire);
      const end = 0.5;
      let fy = 0;
      const steps = Math.round(end / dt);
      for (let i = 0; i <= steps; i++) {
        const time = i * dt;
        const vy = 2 * Math.sin(2 * Math.PI * 3 * time);
        fy = t.step(i === 0 ? 0 : dt, { vx, vy, spin: spinAt(vx), fz: FZ0, yawRate: 0.3 * Math.sin(2 * Math.PI * 2 * time) }).fy;
      }
      return fy;
    };
    const reference = run(0.0000625);
    const errors = [0.004, 0.002, 0.001].map((dt) => Math.abs(run(dt) - reference));
    expect((errors[0] ?? 0) / (errors[1] ?? 1)).toBeGreaterThan(3.5);
    expect((errors[1] ?? 0) / (errors[2] ?? 1)).toBeGreaterThan(3.5);
    expect(errors[2] ?? 1).toBeLessThan(1);
  });

  test("a standing tyre stays bounded under creep and holds on its carcass spring", () => {
    const t = createMagicFormulaTire(tire);
    let peak = 0;
    for (let i = 0; i < 10000; i++) {
      const creep = 0.01 * Math.sin(2 * Math.PI * 5 * i * 0.001);
      const out = t.step(0.001, { vx: creep, vy: 0, spin: 0, fz: FZ0 });
      expect(Number.isFinite(out.fx)).toBe(true);
      peak = Math.max(peak, Math.abs(out.fx));
    }
    expect(peak).toBeLessThan(tire.pdx1 * FZ0 * 1.05);
    const still = t.step(0.001, { vx: 0, vy: 0, spin: 0, fz: FZ0 });
    expect(Number.isFinite(still.fx)).toBe(true);
  });

  test("the right tyre mirrors the left", () => {
    const left = createMagicFormulaTire(tire, { side: "left" });
    const right = createMagicFormulaTire(tire, { side: "right" });
    let l = left.step(0, { vx, vy: 1, spin: spinAt(vx), fz: FZ0, gamma: 0.02 });
    let r = right.step(0, { vx, vy: -1, spin: spinAt(vx), fz: FZ0, gamma: -0.02 });
    for (let i = 0; i < 50; i++) {
      l = left.step(0.002, { vx, vy: 1, spin: spinAt(vx), fz: FZ0, gamma: 0.02 });
      r = right.step(0.002, { vx, vy: -1, spin: spinAt(vx), fz: FZ0, gamma: -0.02 });
    }
    expect(r.fy).toBeCloseTo(-l.fy, 6);
    expect(r.mz).toBeCloseTo(-l.mz, 6);
    expect(r.fx).toBeCloseTo(l.fx, 6);
  });

  test("restore replays the same forces; reset relaxes the contact", () => {
    const t = createMagicFormulaTire(tire);
    const drive = (i: number) => ({ vx, vy: Math.sin(i * 0.05), spin: spinAt(vx) * 1.02, fz: FZ0 });
    for (let i = 0; i < 40; i++) t.step(0.002, drive(i));
    const saved = t.snapshot();
    const first = Array.from({ length: 20 }, (_, i) => t.step(0.002, drive(40 + i)).fy);
    t.restore(saved);
    const again = Array.from({ length: 20 }, (_, i) => t.step(0.002, drive(40 + i)).fy);
    expect(again).toEqual(first);
    t.reset();
    expect(t.snapshot()).toEqual({ u: 0, v: 0, phi: 0, lastU: 0, lastV: 0, lastPhi: 0, primed: false });
  });
});

describe("parseTirFile", () => {
  test("reads TNO keys into camelCase fields and keeps the base for the rest", () => {
    const parsed = parseTirFile(["[DIMENSION]", "UNLOADED_RADIUS          = 0.33   $Free tyre radius", "PDY1 = 1.1", "Q_FZ2 = 12", "! comment", "FITTYP = 61"].join("\n"));
    expect(parsed.unloadedRadius).toBe(0.33);
    expect(parsed.pdy1).toBe(1.1);
    expect(parsed.qFz2).toBe(12);
    expect(parsed.pkx1).toBe(tire.pkx1);
  });
});
