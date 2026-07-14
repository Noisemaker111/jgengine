import { resolveTerrainDetail } from "@jgengine/core/world/terrain";
import type { TerrainMaterialMaps } from "@jgengine/core/world/features";
import { expect, test } from "bun:test";
import * as THREE from "three";

import { createTerrainDetailMaterial, type TerrainDetailMaterialTextures } from "./terrainDetailMaterial";

function fakeShader() {
  return {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: "#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>",
    fragmentShader: [
      "#include <common>",
      "#include <color_fragment>",
      "#include <roughnessmap_fragment>",
      "#include <normal_fragment_maps>",
      "#include <aomap_fragment>",
    ].join("\n"),
  };
}

function compileFragment(): string {
  const { material } = createTerrainDetailMaterial(resolveTerrainDetail({}));
  const shader = fakeShader();
  material.onBeforeCompile?.(shader as never, undefined as never);
  return shader.fragmentShader;
}

const FAKE_MAPS: TerrainMaterialMaps = {
  color: "/materials/grass/color.jpg",
  normal: "/materials/grass/normal.jpg",
  roughness: "/materials/grass/roughness.jpg",
  ao: "/materials/grass/ao.jpg",
  displacement: "/materials/grass/displacement.jpg",
};

function fakeTextures(): TerrainDetailMaterialTextures {
  return {
    color: new THREE.Texture(),
    normal: new THREE.Texture(),
    roughness: new THREE.Texture(),
    ao: new THREE.Texture(),
  };
}

test("terrain detail noise uses a precision-stable integer hash, not the sin hash", () => {
  const frag = compileFragment();
  expect(frag).toContain("jgHashUint");
  expect(frag).toContain("ivec2(floor");
  expect(frag).not.toContain("sin(dot");
});

test("terrain detail hash stays well-distributed at large world coords", () => {
  const hash = (n: number) => {
    let x = Math.imul(Math.trunc(n) >>> 0, 1664525) >>> 0;
    x = Math.imul((x ^ (x >>> 16)) >>> 0, 2246822519) >>> 0;
    x = Math.imul((x ^ (x >>> 13)) >>> 0, 3266489917) >>> 0;
    x = (x ^ (x >>> 16)) >>> 0;
    return x / 4294967296;
  };
  const near = [0, 1, 2, 3, 4, 5, 6, 7].map(hash);
  const far = [1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007].map(hash);
  const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
  expect(spread(far)).toBeGreaterThan(0.5);
  expect(spread(far)).toBeCloseTo(spread(near), 0);
});

test("without a material config, no texture uniforms or sampling code are emitted", () => {
  const { material } = createTerrainDetailMaterial(resolveTerrainDetail({}));
  const shader = fakeShader();
  material.onBeforeCompile?.(shader as never, undefined as never);
  expect(shader.uniforms.uMatColor).toBeUndefined();
  expect(shader.fragmentShader).not.toContain("uMatColor");
  expect(shader.fragmentShader).not.toContain("texture2D(uMatColor");
});

test("a material config with textures wires world-tiled color/roughness/normal/ao sampling", () => {
  const detail = resolveTerrainDetail({ material: { maps: FAKE_MAPS, repeat: 8, strength: 0.5 } });
  const textures = fakeTextures();
  const { material } = createTerrainDetailMaterial(detail, textures);
  const shader = fakeShader();
  material.onBeforeCompile?.(shader as never, undefined as never);

  expect(shader.uniforms.uMatColor?.value).toBe(textures.color);
  expect(shader.uniforms.uMatNormal?.value).toBe(textures.normal);
  expect(shader.uniforms.uMatRoughness?.value).toBe(textures.roughness);
  expect(shader.uniforms.uMatAo?.value).toBe(textures.ao);
  expect(shader.uniforms.uMatRepeat?.value).toBe(8);
  expect(shader.uniforms.uMatStrength?.value).toBe(0.5);

  expect(shader.fragmentShader).toContain("jgMatUv = jgWp / uMatRepeat");
  expect(shader.fragmentShader).toContain("texture2D(uMatColor, jgMatUv)");
  expect(shader.fragmentShader).toContain("mix(jgCol, jgMatColor, uMatStrength)");
  expect(shader.fragmentShader).toContain("roughnessFactor = mix(roughnessFactor, jgMatRough, uMatStrength)");
  expect(shader.fragmentShader).toContain("normal = normalize(normal + vec3(jgMatNormalXy.x");
  expect(shader.fragmentShader).toContain("reflectedLight.indirectDiffuse *= mix(1.0, jgMatAo, uMatStrength)");
});

test("material repeat/strength default to 4 and 1 when omitted", () => {
  const detail = resolveTerrainDetail({ material: { maps: FAKE_MAPS } });
  const { material } = createTerrainDetailMaterial(detail, fakeTextures());
  const shader = fakeShader();
  material.onBeforeCompile?.(shader as never, undefined as never);
  expect(shader.uniforms.uMatRepeat?.value).toBe(4);
  expect(shader.uniforms.uMatStrength?.value).toBe(1);
});

test("passing a material config without loaded textures falls back to the procedural-only look", () => {
  const detail = resolveTerrainDetail({ material: { maps: FAKE_MAPS } });
  const { material } = createTerrainDetailMaterial(detail);
  const shader = fakeShader();
  material.onBeforeCompile?.(shader as never, undefined as never);
  expect(shader.uniforms.uMatColor).toBeUndefined();
  expect(shader.fragmentShader).not.toContain("texture2D(uMatColor");
});
