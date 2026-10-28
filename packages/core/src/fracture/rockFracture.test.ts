import { describe, expect, test } from "bun:test";

import { seededRng } from "../random/rng";
import { boxCell, cellContains, cellVolume, clipCell } from "./convexCell";
import { KWH_PER_TONNE, t10 } from "./fragmentSize";
import { BASALT_BREAKAGE, GRANITE_BREAKAGE, ROCK_BREAKAGE, SANDSTONE_BREAKAGE, fractureRock } from "./rockFracture";
import { ROCK_FRACTURE_GENERATOR, fragmentMesh, rockCell } from "./rockFractureGenerator";

describe("convex cells", () => {
  test("a box clipped through a corner keeps the volume left of the plane, closed", () => {
    const box = boxCell([0, 0, 0], [1, 1, 1]);
    expect(cellVolume(box).volume).toBeCloseTo(1, 12);
    const half = clipCell(box, { normal: [1, 0, 0], offset: 0.25 });
    expect(cellVolume(half).volume).toBeCloseTo(0.25, 12);
    expect(cellVolume(half).centroid[0]).toBeCloseTo(0.125, 12);
    // Cutting off the corner x + y + z > 2 removes a tetrahedron of 1/6.
    const corner = clipCell(box, { normal: [1, 1, 1], offset: 2 });
    expect(cellVolume(corner).volume).toBeCloseTo(1 - 1 / 6, 12);
    expect(corner.faces.filter((face) => face.fracture)).toHaveLength(1);
    expect(cellContains(corner, [0.9, 0.9, 0.9])).toBe(false);
    expect(cellContains(corner, [0.5, 0.5, 0.5])).toBe(true);
    expect(clipCell(box, { normal: [1, 0, 0], offset: -1 }).faces).toHaveLength(0);
  });
});

function stone(seed = "stone") {
  return rockCell([0.3, 0.25, 0.28], 18, 0.2, seededRng(seed));
}

describe("rock fracture", () => {
  test("the pieces and fines keep the rock's mass, and fly off with the asked share of the impact energy", () => {
    const rock = stone();
    const mass = cellVolume(rock).volume * GRANITE_BREAKAGE.density;
    const energy = 0.5 * KWH_PER_TONNE * mass;
    const result = fractureRock(rock, { material: GRANITE_BREAKAGE, energy, impactPoint: [0, 0.25, 0], rng: seededRng("hit"), force: true });
    expect(result.broken).toBe(true);
    const pieces = result.fragments.reduce((sum, f) => sum + f.mass, 0);
    expect(Math.abs(pieces + result.finesMass - mass) / mass).toBeLessThan(1e-9);
    const kinetic = result.fragments.reduce((sum, f) => sum + 0.5 * f.mass * (f.velocity[0] ** 2 + f.velocity[1] ** 2 + f.velocity[2] ** 2), 0);
    expect(kinetic / energy).toBeCloseTo(0.03, 9);
    expect(result.fragments.length).toBeLessThanOrEqual(32);
  });

  test("fragments reproduce the t10 the JKMRC law asks for, within 4 points (a fifth of it when larger), for every rock from 0.1 to 1 kWh/t", () => {
    const rock = stone();
    const volume = cellVolume(rock).volume;
    const size = Math.cbrt((6 * volume) / Math.PI);
    for (const material of ROCK_BREAKAGE) {
      for (const energy of [0.1, 0.25, 1]) {
        const result = fractureRock(rock, { material, energy: energy * KWH_PER_TONNE * volume * material.density, impactPoint: [0, 0.25, 0], rng: seededRng("t10"), force: true });
        const sizes = [...result.fragments.map((f) => f.size), 0];
        const masses = [...result.fragments.map((f) => f.mass), result.finesMass];
        expect(Math.abs(t10({ sizes, masses }, size) - result.t10)).toBeLessThan(Math.max(4, 0.2 * result.t10));
      }
    }
  });

  test("soft sandstone breaks finer than basalt at the same energy, and a light tap leaves a rock whole", () => {
    const rock = stone();
    const volume = cellVolume(rock).volume;
    const at = (material: typeof GRANITE_BREAKAGE, energy: number) => fractureRock(rock, { material, energy: energy * KWH_PER_TONNE * volume * material.density, impactPoint: [0, 0.25, 0], rng: seededRng("order") });
    expect(at(SANDSTONE_BREAKAGE, 0.3).t10).toBeGreaterThan(at(BASALT_BREAKAGE, 0.3).t10);
    const tap = fractureRock(rock, { material: GRANITE_BREAKAGE, energy: 1e-4 * volume * GRANITE_BREAKAGE.density, impactPoint: [0, 0.25, 0], rng: seededRng("tap") });
    expect(tap.probability).toBe(0);
    expect(tap.broken).toBe(false);
    expect(tap.fragments).toHaveLength(1);
  });

  test("the same seed breaks the same way", () => {
    const run = () => fractureRock(stone(), { material: GRANITE_BREAKAGE, energy: 2000, impactPoint: [0, 0.25, 0], rng: seededRng("same"), force: true }).fragments.map((f) => [f.mass, ...f.centre, ...f.velocity]);
    expect(run()).toEqual(run());
  });

  test("fragments mesh as closed flat-shaded rock, and the generator previews a broken stone", () => {
    const result = fractureRock(stone(), { material: GRANITE_BREAKAGE, energy: 3000, impactPoint: [0, 0.25, 0], rng: seededRng("mesh"), force: true });
    const first = result.fragments[0];
    if (first === undefined) throw new Error("no fragment");
    const mesh = fragmentMesh(first, [0.5, 0.5, 0.5], [0.8, 0.8, 0.8]);
    expect(mesh.triangles).toBeGreaterThanOrEqual(4);
    expect(mesh.surface ?? mesh.parts?.[0]?.surface).toBe("rock");
    const params = { seed: "", rock: "granite", size: 0.6, stretch: 1.2, flatness: 0.75, facets: 18, energy: 0.3, fragments: 24, explode: 0, color: "#8a8478", fractureColor: "#c9c2b4" };
    const context = { seed: "g", detail: 1, random: (stream = "") => seededRng(`g:${stream}`) };
    const preview = ROCK_FRACTURE_GENERATOR.generate(params, context);
    expect(preview.triangles).toBeGreaterThan(24 * 4);
    expect(Array.from(ROCK_FRACTURE_GENERATOR.generate(params, context).positions)).toEqual(Array.from(preview.positions));
  });
});
