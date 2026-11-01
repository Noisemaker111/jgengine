import { describe, expect, test } from "bun:test";

import { createEditableTerrain } from "../terrain/terraform";
import { flatField } from "../terrain/terrain";
import { SANDY_LOAM } from "./granularMaterial";
import { createSoftGround, softSurfaceSoil } from "./softGround";

const bounds = { minX: -6, minZ: -3, maxX: 6, maxZ: 3 };
const WHEEL = { load: 4000, width: 0.2, diameter: 0.65 };

function drive(sinkage: number | undefined, recovery?: number) {
  const terrain = createEditableTerrain({ bounds, base: flatField(), cellSize: 0.1 });
  const soft = createSoftGround(terrain, { soil: { materials: [SANDY_LOAM], looseDepth: () => 0.4 }, ...(sinkage === undefined ? {} : { sinkage }), ...(recovery === undefined ? {} : { recovery }) });
  for (let x = -4; x <= 4; x += 0.2) soft.wheel("car:0", { x, z: 0, ...WHEEL });
  soft.step(0);
  return { soft, terrain };
}

describe("soft ground", () => {
  test("sinkage dial: rut depth is finite, bounded by the loose depth and monotone over 0..4", () => {
    const depth = [0, 0.2, 1, 2, 4].map((s) => drive(s).soft.rutDepthAt(0, 0));
    expect(depth[0]).toBe(0);
    for (let k = 1; k < depth.length; k += 1) {
      expect(Number.isFinite(depth[k] ?? Number.NaN)).toBe(true);
      expect(depth[k] ?? 0).toBeGreaterThan(depth[k - 1] ?? 0);
      expect(depth[k] ?? 0).toBeLessThanOrEqual(0.4);
    }
  });

  test("at strength 1 the rut sits near Bekker's static sinkage for the load and writes into the terrain", () => {
    const { soft, terrain } = drive(undefined);
    const rut = soft.rutDepthAt(0, 0);
    expect(rut).toBeGreaterThan(0.005);
    expect(terrain.sampleHeight(0, 0)).toBeCloseTo(-rut, 5);
    // The soil pushed out of the rut rises as a berm beside it.
    expect(soft.rutDepthAt(0, 0.4)).toBeLessThanOrEqual(0);
  });

  test("recovery 0 keeps the rut; a lifted wheel starts a new rut instead of dragging one across", () => {
    const { soft } = drive(1, 0);
    const before = soft.rutDepthAt(0, 0);
    soft.step(5);
    expect(soft.rutDepthAt(0, 0)).toBe(before);
    soft.lift("car:0");
    soft.wheel("car:0", { x: 0, z: 2, ...WHEEL });
    expect(soft.rutDepthAt(0, 1)).toBe(0);
  });
});

describe("soft surface classes", () => {
  test("painted sand ruts and unpainted ground stays hard", () => {
    const terrain = createEditableTerrain({ bounds, base: flatField(), cellSize: 0.1 });
    terrain.apply({ mode: "paint", center: [-3, 0], radius: 2.5, surface: "sand" });
    const soft = createSoftGround(terrain, { soil: softSurfaceSoil(terrain, { sand: { material: SANDY_LOAM, looseDepthM: 0.3 } }) });
    soft.wheel("w", { x: -3, z: 0, ...WHEEL });
    soft.wheel("v", { x: 3, z: 0, ...WHEEL });
    expect(soft.rutDepthAt(-3, 0)).toBeGreaterThan(0);
    expect(soft.rutDepthAt(3, 0)).toBe(0);
  });
});

describe("soft ground state", () => {
  test("a snapshot restores the ruts into the terrain and keeps each wheel's track", () => {
    const { soft, terrain } = drive(1, 0);
    const saved = JSON.parse(JSON.stringify(soft.snapshot()));
    const rut = soft.rutDepthAt(0, 0);
    soft.foot(2, 1, 0.3, 20000);
    soft.restore(saved);
    expect(soft.rutDepthAt(0, 0)).toBeCloseTo(rut, 9);
    expect(soft.rutDepthAt(2, 1)).toBeCloseTo(0, 9);
    expect(terrain.sampleHeight(0, 0)).toBeCloseTo(-rut, 5);
    expect(soft.snapshot().wheels).toEqual(saved.wheels);
  });
});
