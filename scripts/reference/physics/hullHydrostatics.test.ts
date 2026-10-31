import { describe, expect, test } from "bun:test";

import { boxBarge, hullMeshFromOffsets, meshVolume, wigleyHull } from "./hullForm";
import { hydrostaticParticulars, rightingArmCurve, SEA_WATER_DENSITY, summarizeStability } from "./hullHydrostatics";

const DEG = Math.PI / 180;

/** Exact righting arm of a prismatic rectangular section by polygon clipping, independent of the mesh integrator. */
function exactBoxArm(beam: number, depth: number, draft: number, kg: number, heel: number): number {
  const c = Math.cos(heel);
  const s = Math.sin(heel);
  // Corners relative to G, heeled: earth y = c·y − s·z, z = s·y + c·z (Rx).
  const corners: [number, number][] = [
    [-beam / 2, -kg],
    [beam / 2, -kg],
    [beam / 2, depth - kg],
    [-beam / 2, depth - kg],
  ].map(([y, z]) => [c * (y ?? 0) - s * (z ?? 0), s * (y ?? 0) + c * (z ?? 0)]);
  const below = (level: number) => {
    const out: [number, number][] = [];
    for (let i = 0; i < 4; i += 1) {
      const a = corners[i] ?? [0, 0];
      const b = corners[(i + 1) % 4] ?? [0, 0];
      if (a[1] <= level) out.push(a);
      if (a[1] <= level !== b[1] <= level) {
        const t = (level - a[1]) / (b[1] - a[1]);
        out.push([a[0] + t * (b[0] - a[0]), level]);
      }
    }
    let area = 0;
    let cy = 0;
    for (let i = 0; i < out.length; i += 1) {
      const a = out[i] ?? [0, 0];
      const b = out[(i + 1) % out.length] ?? [0, 0];
      const cross = a[0] * b[1] - b[0] * a[1];
      area += cross / 2;
      cy += ((a[0] + b[0]) * cross) / 6;
    }
    return { area: Math.abs(area), y: area !== 0 ? cy / area : 0 };
  };
  let low = -depth - kg;
  let high = depth + kg;
  for (let i = 0; i < 200; i += 1) {
    const mid = 0.5 * (low + high);
    if (below(mid).area > beam * draft) high = mid;
    else low = mid;
  }
  return -below(0.5 * (low + high)).y;
}

describe("hull hydrostatics", () => {
  test("the Wigley hull's volume, waterplane, KB and metacentric radii match their closed forms", () => {
    const length = 100;
    const beam = 10;
    const draft = 6.25;
    const mesh = hullMeshFromOffsets(wigleyHull({ length, beam, draft, stations: 121, waterlines: 40 }));
    const volume = (4 / 9) * length * beam * draft;
    const particulars = hydrostaticParticulars(mesh, { massKg: volume * SEA_WATER_DENSITY, centreOfGravity: [length / 2, 0, 0.5 * draft] });
    expect(particulars.volume / volume).toBeCloseTo(1, 6);
    expect(particulars.draft / draft).toBeCloseTo(1, 2);
    expect(particulars.waterplaneArea / ((2 / 3) * length * beam)).toBeCloseTo(1, 3);
    expect(particulars.centreOfBuoyancy[2] / ((5 / 8) * draft)).toBeCloseTo(1, 3);
    expect(particulars.centreOfBuoyancy[0] / (length / 2)).toBeCloseTo(1, 6);
    expect(particulars.transverseMetacentricRadius / ((3 * beam * beam) / (35 * draft))).toBeCloseTo(1, 2);
    expect(particulars.longitudinalMetacentricRadius / ((3 * length * length) / (40 * draft))).toBeCloseTo(1, 2);
    expect(Math.abs(particulars.attitude.trim)).toBeLessThan(1e-6);
  });

  test("a box barge's GZ curve matches the exact section geometry to 90° and the wall-sided formula before deck-edge immersion", () => {
    const [length, beam, depth, draft, kg] = [60, 12, 6, 3, 3.5];
    const mesh = hullMeshFromOffsets(boxBarge(length, beam, depth));
    expect(meshVolume(mesh)).toBeCloseTo(length * beam * depth, 6);
    const condition = { massKg: length * beam * draft * SEA_WATER_DENSITY, centreOfGravity: [length / 2, 0, kg] as const };
    const particulars = hydrostaticParticulars(mesh, condition);
    const bm = (beam * beam) / (12 * draft);
    const gm = draft / 2 + bm - kg;
    expect(particulars.transverseMetacentricHeight).toBeCloseTo(gm, 6);
    const heels = Array.from({ length: 19 }, (_, i) => i * 5 * DEG);
    const curve = rightingArmCurve(mesh, condition, heels);
    for (const point of curve) {
      expect(point.arm).toBeCloseTo(exactBoxArm(beam, depth, draft, kg, point.heel), 6);
      // Wall-sided until the deck edge immerses (tan φ = (D − T)/(B/2) here).
      if (Math.tan(point.heel) < (depth - draft) / (beam / 2)) {
        const wallSided = Math.sin(point.heel) * (gm + 0.5 * bm * Math.tan(point.heel) ** 2);
        expect(point.arm).toBeCloseTo(wallSided, 6);
      }
    }
    const summary = summarizeStability(curve);
    expect(summary.maxArmHeel).toBeGreaterThan(20 * DEG);
    expect(summary.areaTo30).toBeGreaterThan(0);
  });

  test("a heeled Wigley hull rights itself and its GZ slope at the origin is GM", () => {
    const [length, beam, draft] = [100, 10, 6.25];
    const mesh = hullMeshFromOffsets(wigleyHull({ length, beam, draft, stations: 81, waterlines: 30 }));
    const volume = (4 / 9) * length * beam * draft;
    const condition = { massKg: volume * SEA_WATER_DENSITY, centreOfGravity: [length / 2, 0, 0.5 * draft] as const };
    const gm = (5 / 8) * draft + (3 * beam * beam) / (35 * draft) - 0.5 * draft;
    const [small] = rightingArmCurve(mesh, condition, [0.5 * DEG]);
    expect((small?.arm ?? 0) / Math.sin(0.5 * DEG) / gm).toBeCloseTo(1, 2);
  });
});
