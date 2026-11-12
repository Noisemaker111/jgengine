import { describe, expect, test } from "bun:test";
import {
  GENERATOR_PRESET_PROFILES,
  GENERATOR_REFERENCE_CITATIONS,
  GENERATOR_REFERENCE_PROFILES,
  formatBand,
  judgeBands,
  metricValue,
  referenceProfileFor,
  type ReferenceGenerator,
} from "./referenceBands";

describe("reference bands", () => {
  test("every band cites a known source, has a bound, and every preset maps to a real profile", () => {
    const cites = new Set(GENERATOR_REFERENCE_CITATIONS.map((c) => c.id));
    for (const profile of GENERATOR_REFERENCE_PROFILES) {
      for (const band of profile.bands) {
        expect(cites.has(band.cite)).toBe(true);
        expect(band.min !== undefined || band.max !== undefined).toBe(true);
        if (band.min !== undefined && band.max !== undefined) expect(band.min).toBeLessThanOrEqual(band.max);
      }
    }
    for (const [generator, presets] of Object.entries(GENERATOR_PRESET_PROFILES)) {
      for (const preset of Object.keys(presets)) expect(referenceProfileFor(generator as ReferenceGenerator, preset)).toBeDefined();
    }
    expect(referenceProfileFor("city", "some-future-style")?.id).toBe("urban");
  });

  test("judgeBands reads dotted paths and reports in, low, high and missing", () => {
    expect(metricValue({ blocks: { medianHa: 0.7 } }, "blocks.medianHa")).toBe(0.7);
    const verdicts = judgeBands({ a: 5, b: 1, c: 99, d: Number.NaN }, [
      { metric: "a", min: 1, max: 10, kind: "reference", note: "", cite: "x" },
      { metric: "b", min: 2, kind: "target", note: "", cite: "x" },
      { metric: "c", max: 50, kind: "target", note: "", cite: "x" },
      { metric: "d", max: 1, kind: "target", note: "", cite: "x" },
      { metric: "e", max: 1, kind: "target", note: "", cite: "x" },
    ]).map((j) => j.verdict);
    expect(verdicts).toEqual(["in", "low", "high", "missing", "missing"]);
    expect(formatBand({ metric: "a", min: 0.1, max: 0.25, kind: "reference", note: "", cite: "x" })).toBe("0.1–0.25");
    expect(formatBand({ metric: "a", min: 5, kind: "target", note: "", cite: "x" })).toBe("≥ 5");
  });
});
