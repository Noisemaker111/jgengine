import { describe, expect, test } from "bun:test";
import { computeModelVramFootprintGb, getQuantizationProfile } from "@llmville/game/models/quantization";

describe("getQuantizationProfile", () => {
  test("returns the fp16 profile", () => {
    expect(getQuantizationProfile("fp16")).toEqual({
      precision: "fp16",
      label: "FP16 (full precision)",
      bytesPerParam: 2,
      throughputMult: 1,
      qualityMult: 1,
      method: "unquantized",
    });
  });

  test("returns the fp8 profile", () => {
    const profile = getQuantizationProfile("fp8");
    expect(profile.bytesPerParam).toBe(1);
    expect(profile.throughputMult).toBe(1.8);
    expect(profile.qualityMult).toBe(0.97);
  });

  test("returns the fp4 profile", () => {
    const profile = getQuantizationProfile("fp4");
    expect(profile.bytesPerParam).toBe(0.5);
    expect(profile.throughputMult).toBe(3);
    expect(profile.qualityMult).toBe(0.9);
  });

  test("falls back to fp16 for missing precision", () => {
    expect(getQuantizationProfile(undefined).precision).toBe("fp16");
    expect(getQuantizationProfile(null).precision).toBe("fp16");
  });
});

describe("computeModelVramFootprintGb", () => {
  test("scales linearly with params and quantization bytes-per-param", () => {
    expect(computeModelVramFootprintGb(8, "fp16")).toBeCloseTo(19.2, 6);
    expect(computeModelVramFootprintGb(8, "fp8")).toBeCloseTo(9.6, 6);
    expect(computeModelVramFootprintGb(8, "fp4")).toBeCloseTo(4.8, 6);
  });

  test("applies the runtime overhead multiplier", () => {
    expect(computeModelVramFootprintGb(671, "fp4")).toBeCloseTo(402.6, 6);
  });

  test("floors at 0.1 GB for zero or negative params", () => {
    expect(computeModelVramFootprintGb(0, "fp16")).toBe(0.1);
    expect(computeModelVramFootprintGb(-5, "fp16")).toBe(0.1);
  });
});
