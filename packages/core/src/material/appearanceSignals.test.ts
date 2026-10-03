import { describe, expect, test } from "bun:test";
import { createEnvironmentField, type EnvironmentSample } from "../world/envField";
import { resolveMaterialAppearance, sampleMaterialAppearance, type MaterialAppearanceBaseline } from "./appearanceSignals";

const baseline: MaterialAppearanceBaseline = { roughness: 0.8, colorLinear: [0.8, 0.4, 0.2], sheen: 0.6, clearcoat: 0, clearcoatRoughness: 0.4 };
const sample = (wetness: number, lightExposure = 1): EnvironmentSample => ({ temperature: 20, wetness, lightExposure, ambientLight: 0.5, sheltered: false });

describe("local material appearance signals", () => {
  test("policy is sparse and never enables features just because it rained", () => {
    expect(resolveMaterialAppearance(sample(1), baseline)).toEqual({ surface: {}, wetness: 1 });
    const response = resolveMaterialAppearance(sample(1), baseline, { wetness: { roughness: 0.3 } });
    expect(response.surface).toEqual({ roughness: 0.3 });
    expect(response.colorLinear).toBeUndefined();
    expect(response.surface.transmission).toBeUndefined();
    expect(response.surface.alphaMode).toBeUndefined();
    expect(response.surface.clearcoat).toBeUndefined();
  });

  test("wet endpoints interpolate linear albedo and resolved physical response without drift", () => {
    const policy = { wetness: { roughness: 0.2, colorRetention: 0.5, sheen: 0.1, clearcoat: { strength: 0.8, roughness: 0.1 } } };
    const response = resolveMaterialAppearance(sample(0.5), baseline, policy);
    expect(response.surface.roughness).toBeCloseTo(0.5);
    expect(response.surface.sheen).toBeCloseTo(0.35);
    expect(response.surface.clearcoat).toBeCloseTo(0.4);
    expect(response.surface.clearcoatRoughness).toBeCloseTo(0.25);
    response.colorLinear?.forEach((value, index) => expect(value).toBeCloseTo(baseline.colorLinear[index]! * 0.75));
    expect(resolveMaterialAppearance(sample(0.5), baseline, policy)).toEqual(response);
    expect(resolveMaterialAppearance(sample(0), baseline, policy).surface).toEqual({ roughness: 0.8, sheen: 0.6, clearcoat: 0, clearcoatRoughness: 0.4 });
    expect(baseline.colorLinear).toEqual([0.8, 0.4, 0.2]);
  });

  test("shelter is sampled once and wetness is independent of sunlight", () => {
    const field = createEnvironmentField({ dayLength: 100, rain: 0.8, occluders: [{ x: 0, z: 0, w: 2, d: 2, shade: 0.5 }] });
    const policy = { wetness: { roughness: 0.2 } };
    const night = sampleMaterialAppearance(field, { x: 0, z: 0, time: 0 }, baseline, policy);
    const noon = sampleMaterialAppearance(field, { x: 0, z: 0, time: 50 }, baseline, policy);
    expect(night).toEqual(noon);
    expect(noon.wetness).toBe(0.4);
    expect(noon.surface.roughness).toBeCloseTo(0.56);
    const roof = createEnvironmentField({ rain: 1, occluders: [{ x: 0, z: 0, w: 2, d: 2 }] });
    expect(sampleMaterialAppearance(roof, { x: 0, z: 0, time: 50 }, baseline, policy).surface.roughness).toBe(0.8);
  });

  test("each target takes exactly one sample with its caller position and time", () => {
    let calls = 0;
    sampleMaterialAppearance({ sample(x, z, time, y) { calls++; expect([x, z, time, y]).toEqual([3, 4, 5, 6]); return sample(0.5); } }, { x: 3, z: 4, y: 6, time: 5 }, baseline, { wetness: { influence: 0.2, roughness: 0.3 } });
    expect(calls).toBe(1);
  });

  test("local exposure only attenuates explicitly requested card backlighting", () => {
    const response = resolveMaterialAppearance(sample(0.8, 0.2), baseline, { cardBacklightExposure: true });
    expect(response).toEqual({ surface: {}, wetness: 0.8, backlightExposure: 0.2 });
    expect(resolveMaterialAppearance(sample(1, 0), baseline, { wetness: { roughness: 0.2 } }).surface.roughness).toBeCloseTo(0.2);
  });

  test("invalid endpoints or unresolved physical values fail before producing edits", () => {
    expect(() => resolveMaterialAppearance(sample(1), { ...baseline, sheen: undefined }, { wetness: { sheen: 0.2 } })).toThrow("original physical material");
    expect(() => resolveMaterialAppearance(sample(1), baseline, { wetness: { roughness: NaN } })).toThrow("finite");
    expect(() => resolveMaterialAppearance(sample(1), baseline, { wetness: { colorRetention: -1 } })).toThrow("finite");
    expect(() => resolveMaterialAppearance(sample(1), baseline, { wetness: { influence: 2 } })).toThrow("finite");
  });
});
