import { describe, expect, test } from "bun:test";

import { seededRng } from "../../random/rng";
import { createCmaEvolutionStrategy } from "../../math/cmaEvolutionStrategy";
import { DE_LEVA_MALE, planarHumanSegments } from "./anthropometry";
import { CHANG_KRAM_CURVE_SPEEDS, maxCurveSpeed, minTurnRadius, RECREATIONAL_SPRINTER } from "./curveRunning";
import { createHumanBody } from "./humanBody";
import { RECREATIONAL_SPRINT_PROFILE, slopeSpeed, sprint, sprintTopSpeed, stoppingDistance } from "./humanEnvelope";
import { FITTED_WALKS, fittedWalk, measureWalk } from "./humanGaits";
import { simulateJump } from "./humanJump";
import { formatHumanValidation, measureFittedWalks, validateHumanReference } from "./humanReferenceValidation";
import { createPlanarMultibody } from "./planarMultibody";
import { RECREATIONAL_RUNNER, springMassStep } from "./springMassRunning";

describe("planar multibody", () => {
  test("a free double pendulum keeps its energy", () => {
    const model = createPlanarMultibody([
      { name: "a", parent: -1, joint: [0, 0], com: [0, -0.5], mass: 2, inertia: 0.2 },
      { name: "b", parent: 0, joint: [0, -1], com: [0, -0.4], mass: 1, inertia: 0.05 },
    ]);
    const q = new Float64Array(model.dofs);
    const u = new Float64Array(model.dofs);
    const Q = new Float64Array(model.dofs);
    const acc = new Float64Array(model.dofs);
    q[2] = 1;
    q[3] = -0.5;
    u[0] = 0.3;
    u[1] = 2;
    const com = new Float64Array(4);
    const energy = () => model.kineticEnergy(q, u) + model.totalMass * 9.81 * (model.centerOfMass(q, u, com)[1] ?? 0);
    const start = energy();
    const dt = 1e-4;
    for (let i = 0; i < 10000; i++) {
      model.accelerations(q, u, Q, 9.81, acc);
      for (let k = 0; k < model.dofs; k++) {
        u[k] = (u[k] ?? 0) + (acc[k] ?? 0) * dt;
        q[k] = (q[k] ?? 0) + (u[k] ?? 0) * dt;
      }
    }
    expect(Math.abs(energy() - start)).toBeLessThan(0.01 * Math.abs(start) + 0.05);
  });
});

describe("anthropometry", () => {
  test("the seven segments carry the whole body mass and scale with stature", () => {
    const body = planarHumanSegments(80, 1.8);
    const mass = body.segments.reduce((sum, s) => sum + s.mass, 0);
    expect(mass).toBeCloseTo(80, 6);
    expect(body.thighLength).toBeCloseTo((DE_LEVA_MALE.thigh.length * 1.8) / DE_LEVA_MALE.stature, 6);
    expect(body.legLength).toBeGreaterThan(0.9);
    expect(body.legLength).toBeLessThan(1);
  });

  test("the body stands on its feet at one body weight", () => {
    const body = createHumanBody({ mass: 80, stature: 1.8 });
    body.reset(0);
    for (let i = 0; i < 400; i++) body.stepMuscles({ rightHip: 0, rightKnee: 0, rightAnkle: 0, leftHip: 0, leftKnee: 0, leftAnkle: 0 });
    const weight = ((body.feet.right[1] ?? 0) + (body.feet.left[1] ?? 0)) / (80 * 9.81);
    expect(weight).toBeGreaterThan(0.9);
    expect(weight).toBeLessThan(1.1);
  });
});

describe("cma-es", () => {
  test("finds the minimum of a shifted ellipsoid", () => {
    const cma = createCmaEvolutionStrategy({ mean: [0, 0, 0], sigma: 1, random: seededRng("cma"), populationSize: 10 });
    const f = (x: readonly number[]) => ((x[0] ?? 0) - 1) ** 2 + 10 * ((x[1] ?? 0) + 2) ** 2 + 100 * ((x[2] ?? 0) - 0.5) ** 2;
    for (let g = 0; g < 150; g++) {
      const pop = cma.ask();
      cma.tell(pop, pop.map(f));
    }
    expect(cma.best()?.f ?? 1).toBeLessThan(1e-6);
  });
});

describe("walking", () => {
  test("the fitted walk at 1.3 m/s walks with a double-hump ground force at near Ralston's cost", () => {
    const report = measureWalk(fittedWalk(1.3), 3, 5);
    expect(report.fell).toBe(false);
    expect(report.speed).toBeGreaterThan(1.2);
    expect(report.speed).toBeLessThan(1.4);
    expect(report.force.humps).toBeGreaterThanOrEqual(1.8);
    expect(report.flightShare).toBeLessThan(0.01);
    const ralston = (2.23 + 1.26 * report.speed ** 2) / report.speed;
    expect(Math.abs(report.grossCost - ralston) / ralston).toBeLessThan(0.12);
  });

  test("every fitted walk stays up on its own terrain", () => {
    expect(FITTED_WALKS.some((w) => w.terrain === "uphill")).toBe(true);
    expect(FITTED_WALKS.some((w) => w.terrain === "stairs")).toBe(true);
    for (const walk of FITTED_WALKS) expect(measureWalk(walk, 3, 4).fell).toBe(false);
  });
});

describe("running, sprinting and turning", () => {
  test("the spring-mass runner lands a single force peak near Cavanagh and Lafortune's 2.7 BW at 4.5 m/s", () => {
    const step = springMassStep(RECREATIONAL_RUNNER, 4.5);
    expect(step.peakForce).toBeGreaterThan(2.5);
    expect(step.peakForce).toBeLessThan(2.9);
    expect(step.dutyFactor).toBeLessThan(0.5);
  });

  test("the sprint profile tops out at the recreational 7.7 m/s and stops within friction", () => {
    expect(sprintTopSpeed(RECREATIONAL_SPRINT_PROFILE)).toBeCloseTo(7.7, 1);
    expect(sprint(RECREATIONAL_SPRINT_PROFILE, { distance: 30 }).time).toBeGreaterThan(4.4);
    expect(stoppingDistance(RECREATIONAL_SPRINT_PROFILE, 7).distance).toBeCloseTo(49 / 12, 6);
  });

  test("curve speeds match Chang and Kram within 5% and the turn radius inverts them", () => {
    for (const curve of CHANG_KRAM_CURVE_SPEEDS) {
      if (!Number.isFinite(curve.radius)) continue;
      expect(Math.abs(maxCurveSpeed(RECREATIONAL_SPRINTER, curve.radius) / curve.speed - 1)).toBeLessThan(0.05);
    }
    expect(minTurnRadius(RECREATIONAL_SPRINTER, maxCurveSpeed(RECREATIONAL_SPRINTER, 6))).toBeCloseTo(6, 1);
  });

  test("a steady effort slows a walker uphill as Minetti's cost polynomial says", () => {
    expect(slopeSpeed("walk", 1.3, 0)).toBeCloseTo(1.3, 6);
    expect(slopeSpeed("walk", 1.3, 0.1)).toBeLessThan(0.7);
    expect(slopeSpeed("run", 3.5, 0.1)).toBeLessThan(2.2);
  });
});

describe("jumping", () => {
  test("the torque-driven countermovement jump rises in the published range on an upright trunk", () => {
    const jump = simulateJump();
    expect(jump.height).toBeGreaterThan(0.3);
    expect(jump.height).toBeLessThan(0.45);
    expect(jump.pushPeak).toBeLessThan(3.2);
    expect(Math.abs(jump.takeoffTrunk)).toBeLessThan(0.3);
    expect(jump.airTime).toBeGreaterThan(0.45);
  });
});

describe("validation table", () => {
  test("names every check with its source and passes the published ranges it meets today", () => {
    const rows = validateHumanReference(measureFittedWalks(FITTED_WALKS.filter((w) => w.terrain === "level")));
    expect(rows.length).toBeGreaterThan(20);
    for (const row of rows) expect(row.source.length).toBeGreaterThan(0);
    expect(formatHumanValidation(rows)).toContain("Stride length");
    const passing = ["walkCost", "walkStride", "walkCadence", "walkDuty", "walkFirstPeak", "walkValley", "walkSecondPeak", "runPeak", "runContact", "runDuty", "runTouchdown", "sprintTop", "sprint30", "stop7", "test505", "curve1", "curve6", "jumpHeight", "jumpTakeoff", "jumpDepth", "jumpPush", "jumpAir"];
    for (const metric of passing) expect(rows.find((r) => r.metric === metric)?.pass).toBe(true);
  });
});
