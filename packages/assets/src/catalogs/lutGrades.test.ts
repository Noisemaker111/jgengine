import { describe, expect, test } from "bun:test";

import { parseCubeLut } from "@jgengine/core/postfx/cubeLut";
import { createGradePass } from "@jgengine/core/postfx/gradeShader.draw";

import { LUT_GRADES, LUT_GRADE_LICENSE, LUT_GRADE_SIZE, applyLutRecipe, bakeLutGrade, lutGrade, lutGradeFile } from "./lutGrades";

describe("lut grades", () => {
  test("ships 16 distinct, licensed 32³ grades", () => {
    expect(LUT_GRADES).toHaveLength(16);
    expect(new Set(LUT_GRADES.map((grade) => grade.id)).size).toBe(16);
    expect(LUT_GRADE_LICENSE).toBe("CC0-1.0");
    const cube = bakeLutGrade("cold-teal");
    expect(cube.size).toBe(LUT_GRADE_SIZE);
    expect(cube.data).toHaveLength(32 ** 3 * 3);
  });
  test("every .cube file parses back to the baked cube and differs from identity", () => {
    for (const grade of LUT_GRADES) {
      const baked = bakeLutGrade(grade.id);
      expect([...parseCubeLut(lutGradeFile(grade.id)).data]).toEqual([...baked.data]);
      const mid = applyLutRecipe(grade.recipe, 0.4, 0.5, 0.6);
      expect(mid.every(Number.isFinite)).toBe(true);
      expect(Math.abs(mid[0] - 0.4) + Math.abs(mid[1] - 0.5) + Math.abs(mid[2] - 0.6)).toBeGreaterThan(0.01);
    }
  });
  test("an empty recipe is the identity", () => {
    expect(applyLutRecipe({}, 0.2, 0.5, 0.9)).toEqual([0.2, 0.5, 0.9]);
  });
  test("a grade id reaches the grade stage and a missing one throws", async () => {
    const fetched: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      fetched.push(url);
      return new Response(lutGradeFile("night-blue"));
    }) as unknown as typeof fetch;
    try {
      const loaded = createGradePass({ lut: lutGrade("night-blue") });
      await new Promise((done) => setTimeout(done, 5)); // wait-ok: lets the fetch microtasks settle
      expect(fetched).toEqual(["/lut/night-blue.cube"]);
      expect(loaded.uniforms.uLutSize.value).toBe(32);
      loaded.dispose();
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(() => lutGrade("missing" as never)).toThrow("unknown LUT grade");
  });
});
