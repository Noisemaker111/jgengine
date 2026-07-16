import { expect, test } from "bun:test";

import { SOIL_DEFAULTS } from "@jgengine/core/world/soilKind";

import { createSoilPatchMaterial } from "./soilPatchMaterial";

function fakeShader() {
  return {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: "#include <common>\n#include <begin_vertex>",
    fragmentShader: ["#include <common>", "#include <color_fragment>"].join("\n"),
  };
}

function compile(rules = SOIL_DEFAULTS) {
  const material = createSoilPatchMaterial(rules);
  const shader = fakeShader();
  material.onBeforeCompile?.(shader as never, undefined as never);
  return shader;
}

test("injects a Worley crack mask and an FBM moss mask into color_fragment", () => {
  const shader = compile();
  expect(shader.fragmentShader).toContain("jgSoilWorleyF1F2");
  expect(shader.fragmentShader).toContain("jgSoilFbm");
  expect(shader.fragmentShader).toContain("diffuseColor.rgb = jgSoilCol");
});

test("wires crack/moss uniforms from the resolved rules", () => {
  const shader = compile({ ...SOIL_DEFAULTS, crackScale: 5, crackIntensity: 0.8, mossCoverage: 0.4 });
  expect(shader.uniforms.uSoilCrackScale?.value).toBe(5);
  expect(shader.uniforms.uSoilCrackIntensity?.value).toBe(0.8);
  expect(shader.uniforms.uSoilMossCoverage?.value).toBe(0.4);
});

test("different seeds produce different seed offsets and cache keys", () => {
  const a = createSoilPatchMaterial({ ...SOIL_DEFAULTS, seed: "alpha" });
  const b = createSoilPatchMaterial({ ...SOIL_DEFAULTS, seed: "beta" });
  expect(a.customProgramCacheKey?.()).not.toBe(b.customProgramCacheKey?.());
});

test("uses a precision-stable integer hash, not the sin hash", () => {
  const shader = compile();
  expect(shader.fragmentShader).toContain("jgSoilHashUint");
  expect(shader.fragmentShader).not.toContain("sin(dot");
});
