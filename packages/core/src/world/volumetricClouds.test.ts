import { describe, expect, test } from "bun:test";

import { resolveVolumetricClouds, VOLUMETRIC_CLOUDS_DEFAULTS } from "./volumetricClouds";
import { sky } from "./features";

describe("resolveVolumetricClouds", () => {
  test("defaults an empty config to the moderate drifting layer", () => {
    expect(resolveVolumetricClouds()).toEqual(VOLUMETRIC_CLOUDS_DEFAULTS);
    expect(resolveVolumetricClouds({})).toEqual(VOLUMETRIC_CLOUDS_DEFAULTS);
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
      color: "#112233",
      sunColor: "#ffeecc",
      sunScatter: 0.8,
      seed: "storm",
    });
    expect(rules).toEqual({
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
