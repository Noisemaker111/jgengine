import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { applyGroundEdgeFade, buildGroundCoverageMask, createGroundEdgeFade, type GroundCoverageMask } from "./groundEdgeFade";
import { createSurfaceRibbonMaterial } from "./surfaceRibbonMaterial";

/** A flat XZ rectangle as two triangles. */
const rect = (x0: number, z0: number, x1: number, z1: number): THREE.BufferGeometry => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([x0, 0, z0, x1, 0, z0, x0, 0, z1, x1, 0, z1], 3));
  geometry.setIndex([0, 2, 1, 1, 2, 3]);
  return geometry;
};

const at = (mask: GroundCoverageMask, x: number, z: number): number => {
  const i = Math.floor((x - mask.originX) / mask.cell);
  const j = Math.floor((z - mask.originZ) / mask.cell);
  return mask.data[j * mask.columns + i]! / 255;
};

const shaderFor = (material: THREE.Material) => {
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader,
  } as unknown as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
};

describe("buildGroundCoverageMask", () => {
  // A road (x 0..4) beside a plaza (x 4.4..20) with a 0.4 m kerb gap, both z 0..20.
  const road = rect(0, 0, 4, 20);
  const plaza = rect(4.4, 0, 20, 20);
  const mask = buildGroundCoverageMask([road, plaza, null], { width: 2 })!;

  test("the merged footprint's outer edge is clear and fades in over the width", () => {
    expect(at(mask, 0.1, 10)).toBeLessThan(0.15);
    expect(at(mask, 1, 10)).toBeGreaterThan(0.3);
    expect(at(mask, 1, 10)).toBeLessThan(0.7);
    expect(at(mask, 3, 10)).toBe(1);
    expect(at(mask, -3, 10)).toBe(0);
  });

  test("a seam between two layers stays opaque", () => {
    expect(at(mask, 3.9, 10)).toBe(1);
    expect(at(mask, 4.2, 10)).toBe(1);
    expect(at(mask, 4.6, 10)).toBe(1);
  });

  test("a gap wider than the close radius is an edge again", () => {
    const apart = buildGroundCoverageMask([rect(0, 0, 4, 20), rect(10, 0, 20, 20)], { width: 2 })!;
    expect(at(apart, 3.9, 10)).toBeLessThan(0.2);
    expect(at(apart, 10.1, 10)).toBeLessThan(0.2);
  });

  test("large footprints coarsen cells to the per-axis cap; empty input is null", () => {
    const big = buildGroundCoverageMask([rect(0, 0, 2000, 10)], { width: 3, maxCells: 400 })!;
    expect(big.columns).toBeLessThanOrEqual(401);
    expect(big.cell).toBeGreaterThan(5);
    expect(buildGroundCoverageMask([], { width: 2 })).toBeNull();
  });
});

describe("applyGroundEdgeFade", () => {
  test("a plain material blends, keeps depth writes and samples the shared mask", () => {
    const fade = createGroundEdgeFade();
    const material = applyGroundEdgeFade(new THREE.MeshStandardMaterial(), fade);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(true);
    const shader = shaderFor(material);
    expect(shader.uniforms["uJgFadeMask"]).toBe(fade.uniforms.uJgFadeMask);
    expect(shader.vertexShader).toContain("vJgFadePos = (modelMatrix");
    expect(shader.fragmentShader).toContain("texture2D(uJgFadeMask");
    expect(material.customProgramCacheKey()).toContain("jgedgefade");
  });

  test("setMask swaps the texture and bounds in place", () => {
    const fade = createGroundEdgeFade();
    const first = fade.uniforms.uJgFadeMask.value;
    const mask = buildGroundCoverageMask([rect(0, 0, 10, 10)], { width: 2 })!;
    fade.setMask(mask, 2);
    expect(fade.uniforms.uJgFadeMask.value).not.toBe(first);
    expect(fade.uniforms.uJgFadeMask.value.unpackAlignment).toBe(1);
    expect(fade.uniforms.uJgFadeBounds.value.x).toBe(mask.originX);
    expect(fade.uniforms.uJgFadeBounds.value.z).toBeCloseTo(mask.columns * mask.cell);
    expect(fade.uniforms.uJgFadeWidth.value).toBe(2);
  });

  test("composes with the surface ribbon material without dropping its shading", () => {
    const fade = createGroundEdgeFade();
    const ribbon = createSurfaceRibbonMaterial({ color: "#3a3b3d", halfWidth: 1, surface: "road" });
    const plainKey = ribbon.customProgramCacheKey();
    applyGroundEdgeFade(ribbon, fade);
    const shader = shaderFor(ribbon);
    expect(shader.fragmentShader).toContain("jgSurface(");
    expect(shader.fragmentShader).toContain("uJgFadeMask");
    expect(shader.uniforms["uJgRough"]).toBeDefined();
    expect(ribbon.customProgramCacheKey()).toBe(`${plainKey}-jgedgefade`);
  });
});
