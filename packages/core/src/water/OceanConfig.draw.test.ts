import { createWaveField } from "./seaState";
import { describe, expect, test } from "bun:test";
import { synthesizeWaves, waterSurface } from "@jgengine/core/water/waterSurface";

import {
  MAX_OCEAN_WAVES,
  buildOceanWaveUniforms,
  createOceanConfig,
} from "./OceanConfig.draw";

describe("createOceanConfig", () => {
  test("applies quality presets and explicit overrides", () => {
    const config = createOceanConfig({ quality: "high", size: 900, resolution: 64 });
    expect(config.quality).toBe("high");
    expect(config.size).toBe(900);
    expect(config.depth).toBe(900);
    expect(config.resolution).toBe(64);
  });

  test("accepts independent width and depth for rectangular oceans", () => {
    const wide = createOceanConfig({ size: 200, depth: 40 });
    expect(wide.size).toBe(200);
    expect(wide.depth).toBe(40);

    const tall = createOceanConfig({ size: 30, depth: 120 });
    expect(tall.size).toBe(30);
    expect(tall.depth).toBe(120);

    const square = createOceanConfig({ size: 80 });
    expect(square.size).toBe(80);
    expect(square.depth).toBe(80);
  });

  test("draws the core water model's waves, so buoyancy rides the drawn swell", () => {
    const waves = { waveHeight: 0.9, waveScale: 24, waveSpeed: 0.5, direction: 30 };
    const config = createOceanConfig({ waves });
    const cpu = waterSurface(waves);
    expect(config.waves).toEqual(cpu.waves);
    expect(config.waves).toEqual(synthesizeWaves(waves));
  });

  test("caps the wave set at the shader's slots", () => {
    const config = createOceanConfig({ waves: { waves: 9 } });
    expect(config.waves).toHaveLength(MAX_OCEAN_WAVES);
  });

  test("waveScale sets the primary wavelength and the wave uniforms", () => {
    const small = createOceanConfig({ waves: { waveScale: 8 } });
    const large = createOceanConfig({ waves: { waveScale: 40 } });
    expect(small.waves[0]!.wavelength).toBeCloseTo(8, 6);
    expect(large.waves[0]!.wavelength).toBeCloseTo(40, 6);
    expect(buildOceanWaveUniforms(small).params[0]!.x).toBeCloseTo((Math.PI * 2) / 8, 6);
    expect(buildOceanWaveUniforms(large).params[0]!.x).toBeCloseTo((Math.PI * 2) / 40, 6);
  });
});

describe("buildOceanWaveUniforms", () => {
  test("packs the core waves and pads the rest of the slots with still water", () => {
    const config = createOceanConfig({ waves: { waves: 2, waveScale: 8 } });
    const uniforms = buildOceanWaveUniforms(config);
    expect(uniforms.directions).toHaveLength(MAX_OCEAN_WAVES);
    expect(uniforms.params).toHaveLength(MAX_OCEAN_WAVES);
    const first = config.waves[0]!;
    const k = (Math.PI * 2) / first.wavelength;
    expect(uniforms.directions[0]!.x).toBeCloseTo(first.direction[0]);
    expect(uniforms.params[0]!.x).toBeCloseTo(k);
    expect(uniforms.params[0]!.y).toBeCloseTo(first.amplitude);
    expect(uniforms.params[0]!.w).toBeCloseTo(first.speed * k);
    expect(uniforms.params[2]!.y).toBe(0);
  });

  test("a wave field reaches the shader with its phases, largest components first", () => {
    const field = createWaveField({ significantHeight: 2, peakPeriod: 8 }, { seed: 3, components: 24 });
    const config = createOceanConfig({ waves: { field } });
    const uniforms = buildOceanWaveUniforms(config);
    expect(config.waves).toHaveLength(MAX_OCEAN_WAVES);
    expect(uniforms.phases).toHaveLength(MAX_OCEAN_WAVES);
    expect(uniforms.phases[0]).toBeCloseTo((field.components[0]?.phase ?? 0) + Math.PI / 2, 9);
    expect(config.waves[0]?.steepness).toBe(0);
  });
});
