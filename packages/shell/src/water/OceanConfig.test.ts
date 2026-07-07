import { describe, expect, test } from "bun:test";
import { MAX_OCEAN_WAVES, buildOceanWaveUniforms, createOceanConfig } from "./OceanConfig";

describe("createOceanConfig", () => {
  test("applies quality presets and explicit overrides", () => {
    const config = createOceanConfig({ quality: "high", size: 900, resolution: 64 });
    expect(config.quality).toBe("high");
    expect(config.size).toBe(900);
    expect(config.resolution).toBe(64);
  });

  test("normalizes directions from degrees and vectors", () => {
    const angled = createOceanConfig({ direction: 90 });
    expect(angled.direction.x).toBeCloseTo(0);
    expect(angled.direction.z).toBeCloseTo(1);

    const vector = createOceanConfig({ direction: { x: 3, z: 4 } });
    expect(vector.direction.x).toBeCloseTo(0.6);
    expect(vector.direction.z).toBeCloseTo(0.8);
  });

  test("always resolves a fixed shader wave set", () => {
    const config = createOceanConfig({
      amplitude: 2,
      waves: [{ amplitude: 1.5, wavelength: 20, speed: 0.75, direction: 0, steepness: 3 }],
    });
    expect(config.waves).toHaveLength(MAX_OCEAN_WAVES);
    expect(config.waves[0]!.amplitude).toBe(3);
    expect(config.waves[0]!.wavelength).toBe(20);
    expect(config.waves[0]!.speed).toBe(0.75);
    expect(config.waves[0]!.steepness).toBe(1.2);
  });
});

describe("buildOceanWaveUniforms", () => {
  test("packs directions and shader params", () => {
    const config = createOceanConfig({ waves: [{ amplitude: 2, wavelength: 8, speed: 1, direction: 0 }] });
    const uniforms = buildOceanWaveUniforms(config);
    expect(uniforms.directions).toHaveLength(MAX_OCEAN_WAVES);
    expect(uniforms.params).toHaveLength(MAX_OCEAN_WAVES);
    expect(uniforms.directions[0]!.x).toBeCloseTo(1);
    expect(uniforms.directions[0]!.y).toBeCloseTo(0);
    expect(uniforms.params[0]!.x).toBeCloseTo((Math.PI * 2) / 8);
    expect(uniforms.params[0]!.y).toBeCloseTo(2);
  });
});
