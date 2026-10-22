import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { applyTriplanarProjection, triplanarChunks } from "./triplanarMaterial";

describe("triplanar world projection", () => {
  test("samples by world position, not mesh UVs", () => {
    const chunks = triplanarChunks();
    for (const chunk of [chunks.color, chunks.roughness, chunks.normal, chunks.ao]) {
      expect(chunk).not.toContain("vMapUv");
      expect(chunk).not.toContain("vNormalMapUv");
      expect(chunk).not.toContain("vRoughnessMapUv");
      expect(chunk).not.toContain("vAoMapUv");
    }
    expect(chunks.fragmentPars).toContain("vJgTriPos / uJgTriTile");
    expect(chunks.vertexPosition).toContain("instanceMatrix");
    expect(chunks.vertexPosition).toContain("modelMatrix");
  });

  test("replaces three's own sampling chunks instead of stacking on them", () => {
    const chunks = triplanarChunks();
    expect(chunks.color).not.toContain("#include <map_fragment>");
    expect(chunks.normal).not.toContain("#include <normal_fragment_maps>");
    expect(chunks.ao).not.toContain("#include <aomap_fragment>");
    expect(chunks.roughness).toStartWith("float roughnessFactor = roughness;");
    expect(chunks.color).toContain("#ifdef USE_MAP");
    expect(chunks.normal).toContain("#ifdef USE_NORMALMAP");
    expect(chunks.ao).toContain("#ifdef USE_AOMAP");
    expect(chunks.ao).toContain("computeSpecularOcclusion");
  });

  test("patches a standard material once and rejects bad tile sizes", () => {
    const material = new THREE.MeshStandardMaterial();
    applyTriplanarProjection(material, { tileMetres: 2 });
    const firstHook = material.onBeforeCompile;
    applyTriplanarProjection(material, { tileMetres: 4 });
    expect(material.onBeforeCompile).toBe(firstHook);
    expect(material.customProgramCacheKey()).toContain("jg-triplanar");
    expect(() => applyTriplanarProjection(new THREE.MeshStandardMaterial(), { tileMetres: 0 })).toThrow(/must be finite and positive/);
    expect(() => applyTriplanarProjection(new THREE.MeshStandardMaterial(), { tileMetres: 1, sharpness: -1 })).toThrow(/sharpness/);
    expect(() => applyTriplanarProjection(new THREE.MeshStandardMaterial(), { tileMetres: 1, normalScale: Number.NaN })).toThrow(/normalScale/);
  });

  test("the hook injects only chunks three's shader actually contains", () => {
    const material = new THREE.MeshStandardMaterial();
    applyTriplanarProjection(material, { tileMetres: 1.5, sharpness: 6 });
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    };
    material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(shader.uniforms["uJgTriTile"]?.value).toBe(1.5);
    expect(shader.uniforms["uJgTriSharp"]?.value).toBe(6);
    expect(shader.vertexShader).toContain("vJgTriNormal = normalize(mat3(modelMatrix) * objectNormal)");
    expect(shader.fragmentShader).toContain("uniform float uJgTriTile");
    expect(shader.fragmentShader).not.toContain("#include <normal_fragment_maps>");
    expect(shader.fragmentShader).toContain("float roughnessFactor = roughness;");
    expect(shader.vertexShader.split("vJgTriPos = (modelMatrix * jgTriWorld).xyz;").length).toBe(2);
  });
});
