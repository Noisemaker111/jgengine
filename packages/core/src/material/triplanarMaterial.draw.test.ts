import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { applyTriplanarProjection, triplanarChunks } from "./triplanarMaterial.draw";
import { compilesBatched } from "./compileLayers.draw";
import { materialSignature } from "@jgengine/core/instancing/staticDrawPool.draw";

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
    expect(shader.vertexShader).toContain("vJgTriNormal = normalize(mat3(modelMatrix) * jgTriObjectNormal)");
    expect(shader.fragmentShader).toContain("uniform float uJgTriTile");
    expect(shader.fragmentShader).not.toContain("#include <normal_fragment_maps>");
    expect(shader.fragmentShader).toContain("float roughnessFactor = roughness;");
    expect(shader.vertexShader.split("vJgTriPos = (modelMatrix * jgTriWorld).xyz;").length).toBe(2);
  });

  test("a placement's own rotation turns the projection's normal, under instancing and batching alike", () => {
    const material = new THREE.MeshStandardMaterial();
    applyTriplanarProjection(material, { tileMetres: 2 });
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
    material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    const vertex = shader.vertexShader;
    for (const matrix of ["instanceMatrix", "batchingMatrix"]) {
      expect(vertex).toContain(`jgTriObjectNormal = mat3(${matrix}) * jgTriObjectNormal;`);
      expect(vertex).toContain(`jgTriWorld = ${matrix} * jgTriWorld;`);
    }
    // The batch's matrix is declared by three's batching chunk, which must come before the normal uses it.
    expect(vertex.indexOf("#include <batching_vertex>")).toBeGreaterThan(-1);
    expect(vertex.indexOf("#include <batching_vertex>")).toBeLessThan(vertex.indexOf("mat3(batchingMatrix)"));
  });

  test("triplanar materials share a batched draw only with the same projection", () => {
    const projected = (tileMetres: number) => applyTriplanarProjection(new THREE.MeshStandardMaterial({ color: "#808080" }), { tileMetres, sharpness: 6 });
    const [a, b, c] = [projected(2), projected(2), projected(3)];
    expect(compilesBatched(a)).toBe(true);
    expect(materialSignature(a)).not.toBeNull();
    expect(materialSignature(a)).toBe(materialSignature(b));
    expect(materialSignature(a)).not.toBe(materialSignature(c));
  });
});
