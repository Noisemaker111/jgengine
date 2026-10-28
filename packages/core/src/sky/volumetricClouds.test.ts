import { describe, expect, test } from "bun:test";

import { CLOUD_NOISE_SIZE, cloudNoiseVolume, resolveVolumetricClouds, VOLUMETRIC_CLOUDS_DEFAULTS } from "./volumetricClouds";
import { sky } from "../world/features";

describe("resolveVolumetricClouds", () => {
  test("defaults an empty config to the moderate drifting layer", () => {
    const fade = VOLUMETRIC_CLOUDS_DEFAULTS.height * 8;
    expect(resolveVolumetricClouds()).toEqual({ ...VOLUMETRIC_CLOUDS_DEFAULTS, fade });
    expect(resolveVolumetricClouds({})).toEqual({ ...VOLUMETRIC_CLOUDS_DEFAULTS, fade });
  });

  test("clamps coverage and sunScatter to 0..1", () => {
    expect(resolveVolumetricClouds({ coverage: 4, sunScatter: -2 }).coverage).toBe(1);
    expect(resolveVolumetricClouds({ coverage: -4, sunScatter: -2 }).coverage).toBe(0);
    expect(resolveVolumetricClouds({ sunScatter: 4 }).sunScatter).toBe(1);
  });

  test("floors density/thickness/scale at sane minimums", () => {
    expect(resolveVolumetricClouds({ density: -1 }).density).toBe(0);
    expect(resolveVolumetricClouds({ thickness: 0 }).thickness).toBe(1);
    expect(resolveVolumetricClouds({ scale: 0 }).scale).toBe(1);
  });

  test("passes through explicit values unclamped when in range", () => {
    const rules = resolveVolumetricClouds({
      coverage: 0.7,
      density: 0.9,
      height: 200,
      thickness: 60,
      speed: 2,
      scale: 300,
      fade: 4000,
      color: "#112233",
      sunColor: "#ffeecc",
      sunScatter: 0.8,
      seed: "storm",
    });
    expect(rules).toEqual({
      fade: 4000,
      coverage: 0.7,
      density: 0.9,
      height: 200,
      thickness: 60,
      speed: 2,
      scale: 300,
      color: "#112233",
      sunColor: "#ffeecc",
      sunScatter: 0.8,
      seed: "storm",
    });
  });
});

describe("sky() volumetricClouds passthrough", () => {
  test("omits the field entirely when unset — clouds stay off by default", () => {
    const descriptor = sky({ preset: "day" });
    expect(descriptor.volumetricClouds).toBeUndefined();
    expect("volumetricClouds" in descriptor).toBe(false);
  });

  test("carries the config through unresolved for the shell renderer to resolve", () => {
    const descriptor = sky({ volumetricClouds: { coverage: 0.8, seed: "abc" } });
    expect(descriptor.volumetricClouds).toEqual({ coverage: 0.8, seed: "abc" });
  });
});

describe("cloudNoiseVolume", () => {
  const volume = cloudNoiseVolume();
  const at = (x: number, y: number, z: number) => volume[((z % CLOUD_NOISE_SIZE) * CLOUD_NOISE_SIZE + (y % CLOUD_NOISE_SIZE)) * CLOUD_NOISE_SIZE + (x % CLOUD_NOISE_SIZE)] ?? -1;

  test("is deterministic and spans a usable range", () => {
    expect(cloudNoiseVolume()).toEqual(volume);
    let min = 255;
    let max = 0;
    for (const value of volume) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    expect(min).toBeLessThan(90);
    expect(max).toBeGreaterThan(165);
  });

  test("tiles: opposite faces meet without a seam", () => {
    let worst = 0;
    for (let a = 0; a < CLOUD_NOISE_SIZE; a += 1) {
      for (let b = 0; b < CLOUD_NOISE_SIZE; b += 1) {
        // the step across the wrap is no bigger than steps inside the volume
        worst = Math.max(worst, Math.abs(at(CLOUD_NOISE_SIZE - 1, a, b) - at(0, a, b)), Math.abs(at(a, CLOUD_NOISE_SIZE - 1, b) - at(a, 0, b)));
      }
    }
    let inside = 0;
    for (let a = 0; a < CLOUD_NOISE_SIZE; a += 1) for (let b = 0; b < CLOUD_NOISE_SIZE; b += 1) inside = Math.max(inside, Math.abs(at(5, a, b) - at(6, a, b)));
    expect(worst).toBeLessThanOrEqual(inside + 2);
  });
});
