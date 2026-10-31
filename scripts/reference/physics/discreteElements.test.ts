import { describe, expect, test } from "bun:test";

import { DEM_SAND, measuredRestitution } from "./discreteElementExperiments";
import { bridgeRuptureDistance, capillaryForce, createDiscreteElements, rayleighTime, type DemMaterial, type DemSphereSpec } from "./discreteElements";

const R = 0.005;
const SMOOTH: DemMaterial = { ...DEM_SAND, rollingFriction: 0 };

function onIncline(material: DemMaterial, degrees: number, spheres?: readonly DemSphereSpec[], height = R) {
  const angle = (degrees * Math.PI) / 180;
  const dem = createDiscreteElements({
    materials: [material],
    walls: [{ kind: "plane", point: [0, 0, 0], normal: [0, 1, 0], material: 0 }],
    domain: { min: [-5, -1, -5], max: [5, 5, 5] },
    gravity: [9.81 * Math.sin(angle), -9.81 * Math.cos(angle), 0],
    maxBodies: 1,
    maxSpheres: 8,
  });
  dem.addBody({ position: [0, height * 0.999, 0], material: 0, ...(spheres === undefined ? { radius: R } : { spheres }) });
  return dem;
}

describe("Hertz–Mindlin contact", () => {
  test("a head-on collision rebounds at the material's restitution, whatever the speed", () => {
    for (const e of [0.3, 0.55, 0.9]) {
      for (const speed of [0.05, 0.3, 1]) {
        expect(Math.abs(measuredRestitution({ ...DEM_SAND, restitution: e }, speed) - e)).toBeLessThan(0.03);
      }
    }
  });

  test("a sphere rolls down a plane at 5/7 g sin θ, the no-slip rolling law", () => {
    const dem = onIncline(SMOOTH, 10);
    dem.run(0.5);
    const expected = (5 / 7) * 9.81 * Math.sin((10 * Math.PI) / 180) * 0.5;
    expect(Math.abs((dem.vx[0] ?? 0) - expected) / expected).toBeLessThan(0.01);
    // Rolling without slip: v = ω R.
    expect(Math.abs((dem.vx[0] ?? 0) + (dem.angularVelocity(0)[2] ?? 0) * R) / expected).toBeLessThan(0.01);
  });

  test("past tan θ = 7/2 μ a sphere slides as well as rolls", () => {
    const material = { ...SMOOTH, friction: 0.05 };
    const dem = onIncline(material, 30);
    dem.run(0.3);
    const angle = (30 * Math.PI) / 180;
    // Sliding: a = g (sin θ − μ cos θ).
    const expected = 9.81 * (Math.sin(angle) - 0.05 * Math.cos(angle)) * 0.3;
    expect(Math.abs((dem.vx[0] ?? 0) - expected) / expected).toBeLessThan(0.02);
  });

  test("rolling resistance holds a sphere below atan μ_r and lets it go above", () => {
    const material = { ...DEM_SAND, rollingFriction: 0.3 };
    const held = onIncline(material, 15);
    held.run(0.5);
    expect(Math.abs(held.vx[0] ?? 0)).toBeLessThan(1e-3);
    const rolls = onIncline(material, 20);
    rolls.run(0.5);
    expect(rolls.vx[0] ?? 0).toBeGreaterThan(0.1);
  });

  test("a clump's shape holds it on a slope a smooth sphere rolls down", () => {
    const tetra: DemSphereSpec[] = [
      { offset: [R, 0, R], radius: R },
      { offset: [-R, 0, R], radius: R },
      { offset: [0, 0, -R], radius: R },
      { offset: [0, 1.2 * R, 0.3 * R], radius: R },
    ];
    // Body positions are the centre of mass, 0.3 R above the three feet.
    const clump = onIncline(SMOOTH, 15, tetra, 1.3 * R);
    clump.run(0.6);
    expect(Math.hypot(clump.vx[0] ?? 0, clump.vy[0] ?? 0)).toBeLessThan(0.01);
    const sphere = onIncline(SMOOTH, 15);
    sphere.run(0.6);
    expect(sphere.vx[0] ?? 0).toBeGreaterThan(0.5);
  });

  test("a free clump keeps its angular momentum and spin energy", () => {
    const dem = createDiscreteElements({ materials: [SMOOTH], domain: { min: [-1, -1, -1], max: [1, 1, 1] }, gravity: [0, 0, 0], maxBodies: 1, maxSpheres: 3 });
    dem.addBody({ position: [0, 0, 0], angularVelocity: [3, 1, 2], material: 0, spheres: [{ offset: [-1.5 * R, 0, 0], radius: R }, { offset: [1.5 * R, 0, 0], radius: R }, { offset: [0, 1.2 * R, 0], radius: 0.7 * R }] });
    const energy = dem.kineticEnergy();
    dem.run(0.5);
    expect(Math.abs(dem.kineticEnergy() - energy) / energy).toBeLessThan(0.01);
    const turned = dem.orientation(0);
    expect(Math.abs(Math.hypot(...turned) - 1)).toBeLessThan(1e-9);
    expect(Math.abs(turned[0])).toBeLessThan(0.999);
  });
});

describe("capillary bridges", () => {
  const liquid = { surfaceTension: 0.072, contactAngle: 0, bridgeVolume: 1e-10 };

  test("touching grains feel 2πRγ cos θ and the force decays with the gap until the bridge ruptures", () => {
    expect(capillaryForce(liquid, R, 0)).toBeCloseTo(2 * Math.PI * R * 0.072, 10);
    expect(capillaryForce(liquid, R, 1e-5)).toBeLessThan(capillaryForce(liquid, R, 0));
    expect(bridgeRuptureDistance(liquid)).toBeCloseTo(Math.cbrt(1e-10), 12);
  });

  test("a damp pair stays bound under a pull a dry pair cannot resist", () => {
    const pull = (wet: boolean): number => {
      const dem = createDiscreteElements({ materials: [SMOOTH], domain: { min: [-1, -1, -1], max: [1, 1, 1] }, gravity: [0, 0, 0], maxBodies: 2, ...(wet ? { liquid } : {}) });
      dem.addBody({ position: [-R * 0.999, 0, 0], velocity: [-0.01, 0, 0], material: 0, radius: R });
      dem.addBody({ position: [R * 0.999, 0, 0], velocity: [0.01, 0, 0], material: 0, radius: R });
      dem.run(0.2);
      return (dem.px[1] ?? 0) - (dem.px[0] ?? 0) - 2 * R;
    };
    expect(pull(false)).toBeGreaterThan(1e-3);
    expect(pull(true)).toBeLessThan(bridgeRuptureDistance(liquid));
  });
});

describe("state", () => {
  function shaken() {
    const dem = createDiscreteElements({
      materials: [DEM_SAND],
      walls: [
        { kind: "plane", point: [0, 0, 0], normal: [0, 1, 0], material: 0 },
        { kind: "cylinder", center: [0, 0, 0], axis: [0, 1, 0], radius: 6 * R, length: 1, material: 0 },
      ],
      domain: { min: [-0.2, -0.05, -0.2], max: [0.2, 1, 0.2] },
      liquid: { surfaceTension: 0.072, contactAngle: 0, bridgeVolume: 2e-10 },
      maxBodies: 120,
      maxSpheres: 240,
    });
    for (let i = 0; i < 60; i += 1) dem.addBody({ position: [((i % 5) - 2) * 2.3 * R, R + Math.floor(i / 5) * 2.3 * R, ((i * 7) % 3) - 1 === 0 ? 0 : (((i * 7) % 3) - 1) * 2.3 * R], material: 0, radius: R * (0.9 + 0.2 * ((i * 37) % 11) / 11) });
    for (let i = 0; i < 20; i += 1) dem.addBody({ position: [0, 0.2 + i * 3 * R, 0], material: 0, spheres: [{ offset: [-0.8 * R, 0, 0], radius: R }, { offset: [0.8 * R, 0, 0], radius: R }] });
    dem.setWallMotion(0, { amplitude: [0, 0.004, 0], frequency: 12 });
    return dem;
  }

  test("a snapshot taken mid-run replays bit-identically in a fresh system", () => {
    const original = shaken();
    original.run(0.15);
    const saved = JSON.parse(JSON.stringify(original.snapshot()));
    original.run(0.1);
    const copy = shaken();
    copy.restore(saved);
    copy.run(0.1);
    for (let b = 0; b < original.bodyCount; b += 1) {
      expect(copy.px[b]).toBe(original.px[b] ?? 0);
      expect(copy.vy[b]).toBe(original.vy[b] ?? 0);
    }
  });

  test("the default step is a fifth of the Rayleigh time of the smallest grain", () => {
    const dem = createDiscreteElements({ materials: [DEM_SAND], domain: { min: [-1, -1, -1], max: [1, 1, 1] }, maxBodies: 2 });
    dem.addBody({ position: [0, 0, 0], material: 0, radius: R });
    dem.addBody({ position: [0.1, 0, 0], material: 0, radius: R / 2 });
    expect(dem.dt).toBeCloseTo(0.2 * rayleighTime(DEM_SAND, R / 2), 12);
  });

  test("grains leaving the domain are reported and stop costing work", () => {
    const dem = createDiscreteElements({ materials: [DEM_SAND], domain: { min: [-1, -0.01, -1], max: [1, 1, 1] }, maxBodies: 1 });
    dem.addBody({ position: [0, 0, 0], material: 0, radius: R });
    const report = dem.run(0.1);
    expect(report.exited).toEqual([0]);
    expect(dem.active[0]).toBe(0);
  });
});
