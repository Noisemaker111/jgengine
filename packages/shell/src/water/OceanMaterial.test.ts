import { expect, test } from "bun:test";

import { createOceanConfig } from "./OceanConfig";
import { createOceanMaterial, syncOceanMaterial } from "./OceanMaterial";

const config = createOceanConfig({ color: { sparkle: 0.5 } });

test("glints follow the sky's sun and keep full strength while it is up", () => {
  const material = createOceanMaterial(config);
  syncOceanMaterial(material, config, 3, [0, 10, -10]);
  const sun = material.uniforms.uSunDirection.value;
  expect(sun.length()).toBeCloseTo(1, 6);
  expect(sun.y).toBeCloseTo(Math.SQRT1_2, 6);
  expect(sun.z).toBeCloseTo(-Math.SQRT1_2, 6);
  expect(material.uniforms.uSparkle.value).toBeCloseTo(0.5, 6);
  expect(material.uniforms.uTime.value).toBe(3);
});

test("a set sun leaves a night sea without glints, and a low sun dims them", () => {
  const material = createOceanMaterial(config);
  syncOceanMaterial(material, config, 0, [0, -0.4, 1]);
  expect(material.uniforms.uSparkle.value).toBe(0);
  syncOceanMaterial(material, config, 0, [0, 0.05, 1]);
  expect(material.uniforms.uSparkle.value).toBeGreaterThan(0);
  expect(material.uniforms.uSparkle.value).toBeLessThan(0.5);
});

test("without a sky the fixed day heading is used", () => {
  const material = createOceanMaterial(config);
  syncOceanMaterial(material, config, 0, [0, -1, 0]);
  syncOceanMaterial(material, config, 0);
  expect(material.uniforms.uSunDirection.value.y).toBeGreaterThan(0.5);
  expect(material.uniforms.uSparkle.value).toBeCloseTo(0.5, 6);
});
