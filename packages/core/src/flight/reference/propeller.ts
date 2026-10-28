// @skill jgengine-world
import { createCoefficientTable, evenBreakpoints, type CoefficientTable } from "./coefficientTable";

/** Lift and drag of one blade section at an angle of attack and Mach number. */
export type BladeSection = (alpha: number, mach: number, radiusFraction: number) => { cl: number; cd: number };

/** A fixed-pitch propeller's geometry. */
export interface PropellerGeometry {
  /** Diameter, m. */
  diameter: number;
  blades: number;
  /** Hub (spinner) radius as a fraction of the tip radius. */
  hubFraction: number;
  /** Chord, m, at a radius fraction `0..1`. */
  chord: (radiusFraction: number) => number;
  /** Blade angle to the plane of rotation, rad, at a radius fraction, measured from the section's flat lower surface. */
  bladeAngle: (radiusFraction: number) => number;
  section: BladeSection;
}

/** Thrust and power coefficients `CT = T/(ρn²D⁴)`, `CP = P/(ρn³D⁵)` by advance ratio `J = V/(nD)` and tip Mach. */
export interface PropellerMap {
  thrust: CoefficientTable;
  power: CoefficientTable;
}

/**
 * The section data of a flat-bottomed propeller airfoil in the Clark Y family: a thin-airfoil lift slope corrected by
 * Prandtl–Glauert up to Mach 0.7, zero lift at −4° to the flat lower surface, a stall near `cl = 1.2` that falls to
 * flat-plate lift, a parabolic drag bucket, Lock's compressibility drag rise past a critical Mach that drops as the
 * section thickens toward the hub, and flat-plate drag past the stall.
 * @capability propeller-bemt Clark Y propeller section lift and drag
 */
export function clarkYPropellerSection(alpha: number, mach: number, radiusFraction: number): { cl: number; cd: number } {
  const zeroLift = (-4 * Math.PI) / 180;
  const beta = Math.sqrt(1 - Math.min(0.7, mach) ** 2);
  const slope = (0.9 * 2 * Math.PI) / beta;
  const clMax = 1.2;
  const a = alpha - zeroLift;
  const stall = clMax / slope;
  const plate = 1.1 * Math.sin(2 * a);
  let cl: number;
  let stalled = 0;
  if (Math.abs(a) <= stall) cl = slope * a;
  else {
    stalled = Math.min(1, (Math.abs(a) - stall) / 0.12);
    cl = (1 - stalled) * Math.sign(a) * clMax + stalled * plate;
  }
  const thickness = 0.06 + 0.12 * (1 - radiusFraction);
  const critical = 0.89 - 1.4 * thickness;
  const wave = mach > critical ? 20 * (mach - critical) ** 4 : 0;
  const attached = 0.008 + 0.01 * (cl - 0.4) ** 2;
  const cd = attached + wave + stalled * 1.8 * Math.sin(a) ** 2;
  return { cl, cd };
}

/**
 * Solves blade-element momentum theory for one operating point: each annulus balances the thrust and torque its blade
 * sections make against the axial and swirl momentum it puts into the slipstream, with Prandtl's tip and hub loss.
 * Returns `CT` and `CP`; `J` is the advance ratio and `tipMach` the tip's rotational Mach number.
 * @capability propeller-bemt blade-element momentum propeller thrust and power with tip loss and compressibility
 */
export function solvePropeller(geometry: PropellerGeometry, advanceRatio: number, tipMach: number, speedOfSound = 340.294): { ct: number; cp: number } {
  const radius = geometry.diameter / 2;
  const n = (tipMach * speedOfSound) / (Math.PI * geometry.diameter);
  const omega = 2 * Math.PI * n;
  const v = advanceRatio * n * geometry.diameter;
  const rho = 1;
  const elements = 40;
  const hub = geometry.hubFraction;
  let thrust = 0;
  let torque = 0;
  for (let i = 0; i < elements; i += 1) {
    const x = hub + ((i + 0.5) * (1 - hub)) / elements;
    const dr = ((1 - hub) * radius) / elements;
    const r = x * radius;
    const chord = geometry.chord(x);
    const pitch = geometry.bladeAngle(x);
    let vi = 0;
    let vt = 0;
    let dT = 0;
    let dQ = 0;
    for (let iteration = 0; iteration < 400; iteration += 1) {
      const axial = v + vi;
      const tangential = omega * r - vt;
      const phi = Math.atan2(axial, tangential);
      const w2 = axial * axial + tangential * tangential;
      const { cl, cd } = geometry.section(pitch - phi, Math.sqrt(w2) / speedOfSound, x);
      const sinPhi = Math.max(1e-4, Math.abs(Math.sin(phi)));
      const tip = (geometry.blades / 2) * ((1 - x) / (x * sinPhi));
      const root = (geometry.blades / 2) * ((x - hub) / (hub * sinPhi));
      const loss = Math.max(1e-3, (4 / (Math.PI * Math.PI)) * Math.acos(Math.exp(-tip)) * Math.acos(Math.exp(-root)));
      const q = 0.5 * rho * w2 * geometry.blades * chord;
      dT = q * (cl * Math.cos(phi) - cd * Math.sin(phi));
      dQ = q * (cl * Math.sin(phi) + cd * Math.cos(phi)) * r;
      // Momentum: dT/dr = 4πrρF(V + vi)vi, dQ/dr = 4πr²ρF(V + vi)vt.
      const k = 4 * Math.PI * r * rho * loss;
      const discriminant = v * v + (4 * dT) / k;
      const nextVi = discriminant >= 0 ? (-v + Math.sqrt(discriminant)) / 2 : -v / 2;
      const nextVt = dQ / (k * r * Math.max(1e-3, v + nextVi));
      const change = Math.abs(nextVi - vi) + Math.abs(nextVt - vt);
      vi += 0.25 * (nextVi - vi);
      vt += 0.25 * (Math.min(omega * r * 0.5, nextVt) - vt);
      if (change < 1e-9 * (1 + omega * r)) break;
    }
    thrust += dT * dr;
    torque += dQ * dr;
  }
  const d = geometry.diameter;
  return { ct: thrust / (rho * n * n * d ** 4), cp: (2 * Math.PI * torque) / (rho * n * n * d ** 5) };
}

/**
 * Tabulates a propeller's `CT` and `CP` over advance ratio and tip Mach with {@link solvePropeller}, so a simulation
 * interpolates instead of solving momentum balances every step.
 * @capability propeller-bemt tabulated propeller thrust and power coefficients
 */
export function createPropellerMap(geometry: PropellerGeometry, advanceRatios = evenBreakpoints(0, 1.5, 31), tipMachs = evenBreakpoints(0.2, 0.95, 6)): PropellerMap {
  const thrust: number[] = [];
  const power: number[] = [];
  for (const j of advanceRatios) {
    for (const m of tipMachs) {
      const { ct, cp } = solvePropeller(geometry, j, m);
      thrust.push(ct);
      power.push(cp);
    }
  }
  const axes = [{ breakpoints: advanceRatios, extrapolate: "linear" as const }, { breakpoints: tipMachs }];
  return { thrust: createCoefficientTable(axes, thrust), power: createCoefficientTable(axes, power) };
}
