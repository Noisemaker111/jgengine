import { describe, expect, test } from "bun:test";
import { resolveTerrainGradeStep } from "./terrainGrade";

describe("sampled terrain climb grade", () => {
  test("steep ascent preserves travel along a traversable axis", () => {
    expect(resolveTerrainGradeStep((x) => 2 * x, [0, 0, 0], .1, .1, .85)).toEqual({ stepX: 0, stepZ: .1 });
  });
  test("allowed incline retains diagonal travel and descents remain walkable", () => {
    expect(resolveTerrainGradeStep((x) => .4 * x, [0, 0, 0], .1, .1, .85)).toEqual({ stepX: .1, stepZ: .1 });
    expect(resolveTerrainGradeStep((x) => -2 * x, [0, 0, 0], .1, .1, .85)).toEqual({ stepX: .1, stepZ: .1 });
  });
  test("jump height does not defeat a declared terrain path limit", () => {
    expect(resolveTerrainGradeStep((x) => 2 * x, [0, 10, 0], .1, 0, .85)).toEqual({ stepX: 0, stepZ: 0 });
  });
  test("noise-sized motion and boundary grade remain compatible with existing policy", () => {
    expect(resolveTerrainGradeStep((x) => .85 * x, [0, 0, 0], .1, 0, .85)).toEqual({ stepX: .1, stepZ: 0 });
    expect(resolveTerrainGradeStep((x) => 2 * x, [0, 0, 0], .00001, 0, .85)).toEqual({ stepX: .00001, stepZ: 0 });
  });
  test("invalid grade rejects instead of silently disabling collision", () => {
    for (const grade of [-1, NaN, Infinity]) expect(() => resolveTerrainGradeStep(() => 0, [0, 0, 0], .1, 0, grade)).toThrow("maxClimbGrade");
  });
  test("terrain object sampling preserves method context and remains bounded", () => {
    const sampler = { samples: 0, sampleHeight(x: number) { this.samples++; return 2 * x; } };
    expect(resolveTerrainGradeStep(sampler, [0, 0, 0], .1, .1, .85)).toEqual({ stepX: 0, stepZ: .1 });
    expect(sampler.samples).toBe(4);
  });
  test("invalid terrain samples identify the bad coordinate instead of accepting broken ground", () => {
    expect(() => resolveTerrainGradeStep(() => NaN, [0, 0, 0], .1, 0, .85)).toThrow("finite height at (0, 0)");
    expect(() => resolveTerrainGradeStep(x => x === 0 ? 0 : Infinity, [0, 0, 0], .1, 0, .85)).toThrow("finite height at (0.1, 0)");
  });
});
