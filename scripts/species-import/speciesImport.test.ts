import { describe, expect, test } from "bun:test";

import { growthCurveAt } from "../../packages/core/src/plants/species/speciesReference";
import { createCmaEs } from "./cmaEs";
import { csvNumber, parseCsv } from "./csv";
import { parseBechtoldCrownWidth, parseCarmeanCurves, parseEkCrownWidth } from "./fvsSource";
import { fitGrowthCurve, siteTreesOf, standReference } from "./siteTrees";
import { talloCrownWidthClasses } from "./tallo";

const HTCALC = `      DATA ((LTBHEC(I,J),I=1,6), J= 1,10)/
C 1:RED MAPLE, N.WISCONSIN AND UPPER MICHIGAN
     & 2.9435,     0.9132,     -0.0141,     1.6580,     -0.1095,  0.0,
C 54:BALSAM FIR, LAKE STATES
     & 1.0438,     1.0708,     -0.0222,     1.5915,    -0.1068,   4.5/
`;

const CWCALC = `C  CASE 31803 EK 1974
C  318         ACER SACCHARUM                                SUGAR MAPLE
         CASE ('31803')
           IF (D .GE. OMIND) THEN
            CW = 0.8680 + 4.1500*D**0.7514
C  CASE 31801 BECHTOLD 2003 MODEL 2
         CASE ('31801')
           IF (D .GE. MIND) THEN
            CW = 4.9399 + 1.0727*D + 0.1096*CR - 0.0493*HI
`;

describe("species importer", () => {
  test("a CSV with quoted fields and doubled quotes reads into records", () => {
    const rows = parseCsv('a,b,c\n1,"x, y",\n2,"say ""hi""",3\r\n');
    expect(rows).toEqual([
      { a: "1", b: "x, y", c: "" },
      { a: "2", b: 'say "hi"', c: "3" },
    ]);
    expect(csvNumber("NA")).toBeUndefined();
    expect(csvNumber("743.0")).toBe(743);
  });

  test("Carmean curves read from FVS htcalc.f with their labels and breast-height flag", () => {
    const curves = parseCarmeanCurves(HTCALC);
    expect(curves).toHaveLength(2);
    expect(curves[0]).toEqual({ curve: 1, label: "RED MAPLE, N.WISCONSIN AND UPPER MICHIGAN", b1: 2.9435, b2: 0.9132, b3: -0.0141, b4: 1.658, b5: -0.1095, breastHeightFt: 0 });
    expect(curves[1]?.breastHeightFt).toBe(4.5);
  });

  test("Ek 1974 open-grown crown width reads only from an Ek case", () => {
    expect(parseEkCrownWidth(CWCALC, 318)).toEqual({ a: 0.868, b: 4.15, c: 0.7514 });
    expect(parseEkCrownWidth(CWCALC, 12)).toBeUndefined();
  });

  test("Bechtold 2003 forest-grown crown width keeps the sign of each term", () => {
    expect(parseBechtoldCrownWidth(CWCALC, 318)).toEqual({ a: 4.9399, b: 1.0727, cr: 0.1096, hi: -0.0493 });
    expect(parseBechtoldCrownWidth(CWCALC, 12)).toBeUndefined();
  });

  test("a Chapman–Richards fit recovers the curve its points were drawn from", () => {
    const truth = { a: 30, k: 0.03, p: 1.4 };
    const points = [10, 20, 35, 50, 70, 90, 120].map((age) => ({ age, value: growthCurveAt(truth, age) }));
    const fitted = fitGrowthCurve(points);
    for (const age of [20, 50, 100]) expect(growthCurveAt(fitted, age) / growthCurveAt(truth, age)).toBeCloseTo(1, 2);
  });

  test("site trees convert to metric and centre on a site index", () => {
    const row = (age: number, dia: number, ht: number, si: number): Record<string, string> => ({ SPCD: "318.0", AGEDIA: String(age), DIA: String(dia), HT: String(ht), SITREE: String(si) });
    const rows = [row(20, 5, 40, 60), row(40, 9, 60, 62), row(60, 12, 72, 58), row(80, 14, 80, 61), row(100, 16, 85, 90), { SPCD: "129.0", AGEDIA: "50", DIA: "10", HT: "60", SITREE: "60" }];
    const trees = siteTreesOf(rows, 318);
    expect(trees).toHaveLength(5);
    expect(trees[0]?.dbhCm).toBeCloseTo(12.7, 5);
    expect(trees[0]?.heightM).toBeCloseTo(12.192, 5);
    const reference = standReference(trees, 5, 60);
    expect(reference.trees).toBe(4);
    expect(reference.youngestYears).toBe(25);
    expect(reference.oldestYears).toBe(85);
  });

  test("Tallo crown widths band by DBH class", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ species: "Acer saccharum", stem_diameter_cm: String(12 + (i % 3)), crown_radius_m: String(1 + i / 30) }));
    const { trees, classes } = talloCrownWidthClasses([...rows, { species: "Acer rubrum", stem_diameter_cm: "12", crown_radius_m: "9" }], "Acer saccharum");
    expect(trees).toBe(30);
    expect(classes).toHaveLength(1);
    expect(classes[0]?.dbhCm).toBe(12.5);
    expect(classes[0]?.p50M).toBeGreaterThan(classes[0]?.p10M ?? 0);
  });

  test("CMA-ES finds the minimum of a rotated quadratic", () => {
    const search = createCmaEs([0.9, 0.9, 0.9], 0.3, 12, 7);
    const f = (x: readonly number[]): number => ((x[0] ?? 0) - 0.2) ** 2 + 4 * ((x[1] ?? 0) + (x[0] ?? 0) - 0.5) ** 2 + 2 * ((x[2] ?? 0) - 0.4) ** 2;
    for (let g = 0; g < 120; g += 1) {
      const population = search.ask();
      search.tell(population, population.map(f));
    }
    expect(f(search.mean)).toBeLessThan(1e-6);
  });
});
