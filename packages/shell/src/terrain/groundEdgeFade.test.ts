import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { applyGroundEdgeFade, createGroundEdgeFade, groundEdgeFadeWidth } from "./groundEdgeFade";
import { createSurfaceRibbonMaterial } from "./surfaceRibbonMaterial";

const shaderFor = (material: THREE.Material) => {
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader,
  } as unknown as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
};

const rect = { centerX: 28, centerZ: 0, halfX: 21, halfZ: 27, rotationY: 0, width: 6 };

describe("groundEdgeFade", () => {
  test("fade band is 8 m, capped at 30% of the shorter half size", () => {
    expect(groundEdgeFadeWidth(200, 120)).toBe(8);
    expect(groundEdgeFadeWidth(21, 27)).toBeCloseTo(6.3);
  });

  test("set retargets the shared uniforms", () => {
    const fade = createGroundEdgeFade(rect);
    expect(fade.uniforms.uJgFadeCenter.value.toArray()).toEqual([28, 0]);
    fade.set({ ...rect, centerX: -5, rotationY: Math.PI / 2, width: 3 });
    expect(fade.uniforms.uJgFadeCenter.value.x).toBe(-5);
    expect(fade.uniforms.uJgFadeRot.value.x).toBeCloseTo(0);
    expect(fade.uniforms.uJgFadeRot.value.y).toBeCloseTo(1);
    expect(fade.uniforms.uJgFadeWidth.value).toBe(3);
  });

  test("a plain material blends, keeps depth writes and gets the rim fade", () => {
    const fade = createGroundEdgeFade(rect);
    const material = applyGroundEdgeFade(new THREE.MeshStandardMaterial(), fade);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(true);
    const shader = shaderFor(material);
    expect(shader.uniforms["uJgFadeHalf"]).toBe(fade.uniforms.uJgFadeHalf);
    expect(shader.vertexShader).toContain("vJgFadePos = (modelMatrix");
    expect(shader.fragmentShader).toContain("diffuseColor.a *= smoothstep(0.0, 1.0, jgFadeT)");
    expect(material.customProgramCacheKey()).toContain("jgedgefade");
  });

  test("composes with the surface ribbon material without dropping its shading", () => {
    const fade = createGroundEdgeFade(rect);
    const ribbon = createSurfaceRibbonMaterial({ color: "#3a3b3d", halfWidth: 1, surface: "road" });
    const plainKey = ribbon.customProgramCacheKey();
    applyGroundEdgeFade(ribbon, fade);
    const shader = shaderFor(ribbon);
    expect(shader.fragmentShader).toContain("jgSurface(");
    expect(shader.fragmentShader).toContain("jgFadeT");
    expect(shader.uniforms["uJgRough"]).toBeDefined();
    expect(ribbon.customProgramCacheKey()).toBe(`${plainKey}-jgedgefade`);
  });
});
