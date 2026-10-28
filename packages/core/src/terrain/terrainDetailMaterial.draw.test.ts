import { resolveTerrainDetail } from "@jgengine/core/terrain/terrain";
import type { TerrainMaterialMaps } from "@jgengine/core/world/features";
import { expect, test } from "bun:test";
import * as THREE from "three";

import { createTerrainDetailMaterial, createTerrainSurfaceTextures, type TerrainDetailMaterialTextures } from "./terrainDetailMaterial.draw";
import { createTerrainPaintTextures, packTerrainPaintWeights } from "./terrainSurfaces.draw";
import { surfaceNoiseTexture } from "./terrainSurfaceShader.draw";

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

test("terrain detail noise reads the shared lattice texture, wrapped per cell, not a sin hash", () => {
  const { material } = createTerrainDetailMaterial(resolveTerrainDetail({}));
  const shader = fakeShader();
  material.onBeforeCompile?.(shader as never, undefined as never);
  expect(shader.fragmentShader).toContain("texelFetch(jgNoiseTex, ivec2(floor(cell)) & 255, 0)");
  expect(shader.fragmentShader).not.toContain("sin(dot");
  expect(shader.uniforms.jgNoiseTex?.value).toBe(surfaceNoiseTexture());
});

test("the noise lattice is well spread, and its green channel is red one 3D slice over", () => {
  const texture = surfaceNoiseTexture();
  const data = texture.image.data as Uint8Array;
  const size = texture.image.width;
  let sum = 0;
  let low = 0;
  for (let index = 0; index < size * size; index += 1) {
    sum += data[index * 4]!;
    if (data[index * 4]! < 64) low += 1;
  }
  expect(sum / (size * size)).toBeGreaterThan(118);
  expect(sum / (size * size)).toBeLessThan(137);
  expect(low / (size * size)).toBeGreaterThan(0.2);
  expect(low / (size * size)).toBeLessThan(0.3);
  // A 3D noise at slice z reads cell + (37, 17) * z: green must be red at the next slice's cell.
  for (const [x, y] of [[0, 0], [250, 3], [12, 240], [255, 255]] as const) {
    const next = ((y + 17) % size) * size + ((x + 37) % size);
    expect(data[(y * size + x) * 4 + 1]).toBe(data[next * 4]!);
  }
  expect(surfaceNoiseTexture()).toBe(texture);
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
  expect(shader.fragmentShader).toContain("mix(jgCol, jgMatColor, uMatStrength * uMatTint)");
  // Grain and tint are separable: the luminance term is gated on the tint the caller did NOT spend.
  expect(shader.fragmentShader).toContain("uMatStrength * (1.0 - uMatTint)");
  expect(shader.fragmentShader).toContain("roughnessFactor = clamp(roughnessFactor + (jgMatRough - 0.5) * uMatStrength * 0.6, 0.0, 1.0)");
  expect(shader.fragmentShader).toContain("normal = normalize(normal + (viewMatrix * vec4(jgMatNormalXy.x, 0.0, jgMatNormalXy.y, 0.0)).xyz");
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

test("material tint defaults to 1 so an existing detail material keeps replacing the authored colour", () => {
  const detail = resolveTerrainDetail({ material: { maps: FAKE_MAPS } });
  const { material } = createTerrainDetailMaterial(detail, fakeTextures());
  const shader = fakeShader();
  material.onBeforeCompile?.(shader as never, undefined as never);
  expect(shader.uniforms.uMatTint?.value).toBe(1);
});

test("a low tint keeps the authored colour and takes the map as grain", () => {
  const detail = resolveTerrainDetail({ material: { maps: FAKE_MAPS, tint: 0.2 } });
  const { material } = createTerrainDetailMaterial(detail, fakeTextures());
  const shader = fakeShader();
  material.onBeforeCompile?.(shader as never, undefined as never);
  expect(shader.uniforms.uMatTint?.value).toBe(0.2);
});

test("omitted AO and roughness skip sampling and preserve authored roughness", () => {
  const maps: TerrainMaterialMaps = { color: FAKE_MAPS.color, normal: FAKE_MAPS.normal, displacement: FAKE_MAPS.displacement };
  const detail = resolveTerrainDetail({ roughness: 0.73, material: { maps } });
  const textures = { color: new THREE.Texture(), normal: new THREE.Texture() };
  const { material } = createTerrainDetailMaterial(detail, textures);
  const shader = fakeShader();
  material.onBeforeCompile?.(shader as never, undefined as never);
  expect(material.roughness).toBe(0.73);
  expect(shader.uniforms.uMatRoughness).toBeUndefined();
  expect(shader.uniforms.uMatAo).toBeUndefined();
  expect(shader.fragmentShader).not.toContain("uMatRoughness");
  expect(shader.fragmentShader).not.toContain("uMatAo");
  expect(shader.fragmentShader).toContain("texture2D(uMatColor");
  expect(shader.fragmentShader).toContain("texture2D(uMatNormal");
});

test("optional map presence selects distinct compiled shader programs", () => {
  const detail = resolveTerrainDetail({ material: { maps: FAKE_MAPS } });
  const keys = new Set<string>();
  for (const ao of [false, true]) {
    for (const roughness of [false, true]) {
      const textures = fakeTextures();
      if (!ao) delete textures.ao;
      if (!roughness) delete textures.roughness;
      const { material } = createTerrainDetailMaterial(detail, textures);
      const shader = fakeShader();
      material.onBeforeCompile?.(shader as never, undefined as never);
      expect(shader.fragmentShader.includes("texture2D(uMatAo")).toBe(ao);
      expect(shader.fragmentShader.includes("texture2D(uMatRoughness")).toBe(roughness);
      keys.add(material.customProgramCacheKey());
    }
  }
  expect(keys.size).toBe(4);
});

function paintFor(surfaces: string[]) {
  const packed = packTerrainPaintWeights({
    layers: surfaces.map(surface => ({ id: surface, surface })),
    gridBounds: { minX: 0, minZ: 0, maxX: surfaces.length, maxZ: 1 },
    cols: surfaces.length,
    rows: 1,
    surfaceAt: x => surfaces[Math.floor(x)] ?? null,
    weightsAt: () => [],
  })!;
  return createTerrainPaintTextures(packed);
}

test("painted terrain samples coverage and compiles only the painted surface classes plus rock", () => {
  const paint = paintFor(["grass", "gravel"]);
  const { material } = createTerrainDetailMaterial(resolveTerrainDetail(undefined), undefined, { paint });
  const shader = fakeShader();
  material.onBeforeCompile?.(shader as never, undefined as never);
  expect(material.defines?.JG_TERRAIN_PAINT).toBe("");
  expect(material.defines?.JG_SURFACE_CLASSES).toBe(String((1 << 1) | (1 << 3) | (1 << 4)));
  expect(shader.uniforms.uPaintA?.value).toBe(paint.uniforms.uPaintA!.value);
  expect(shader.fragmentShader).toContain("texture2D(uPaintA, jgPaintTexUv)");
  expect(shader.fragmentShader).toContain("dFdx(jgBumpH)");
  paint.dispose();
});

test("the low tier compiles the cheap surface path and an implicit detail has no snow", () => {
  const detail = resolveTerrainDetail(undefined);
  expect(detail.snowHeight).toBeGreaterThan(1000);
  expect(detail.surfaceStrength).toBe(1);
  const { material } = createTerrainDetailMaterial(detail, undefined, { quality: "low" });
  expect(material.defines?.JG_SURFACE_LOW).toBe("");
  expect(material.defines?.JG_TERRAIN_PAINT).toBeUndefined();
  expect(material.customProgramCacheKey()).toContain("low");
});

test("editor contour strength is a live uniform", () => {
  const handle = createTerrainDetailMaterial(resolveTerrainDetail({}), undefined, { contour: 0.45 });
  const shader = fakeShader();
  handle.material.onBeforeCompile?.(shader as never, undefined as never);
  handle.contour.value = 1;
  expect(shader.uniforms.uContour?.value).toBe(1);
});

test("each blended slot inlines the procedural surface once, so the terrain program stays small to compile", () => {
  const fragment = compileFragment();
  const slot = fragment.slice(fragment.indexOf("JgSurf jgSlot("), fragment.indexOf("vec2 jgWp ="));
  expect(slot.match(/jgSurface\(/g)?.length).toBe(1);
  expect(fragment.match(/jgSlot\(/g)?.length).toBe(3);
});

test("generated surfaces resolve with per-role tile and tint defaults", () => {
  const detail = resolveTerrainDetail({ surfaces: { ground: { preset: "grass" }, rock: { preset: "cliff", tile: 12, tint: 2 } } });
  expect(detail.surfaces?.ground).toEqual({ spec: { preset: "grass" }, tile: 5, tint: 0.8 });
  expect(detail.surfaces?.rock).toEqual({ spec: { preset: "cliff" }, tile: 12, tint: 1 });
  expect(detail.surfaces?.sand).toBeUndefined();
});

test("generated surfaces bake into one array texture and compile only the roles set", () => {
  const detail = resolveTerrainDetail({ surfaces: { sand: { preset: "beach-sand", params: { resolution: "64" } }, rock: { preset: "rock", params: { resolution: "64" } } } });
  const surfaces = createTerrainSurfaceTextures(detail.surfaces);
  expect(surfaces?.textures.albedo.image.depth).toBe(2);
  expect(surfaces?.roles.sand?.layer).toBe(0);
  expect(surfaces?.roles.rock?.layer).toBe(1);
  const { material } = createTerrainDetailMaterial(detail, undefined, surfaces === undefined ? {} : { surfaces });
  expect(material.defines?.["JG_GEN_SAND"]).toBe("0.0");
  expect(material.defines?.["JG_GEN_ROCK"]).toBe("1.0");
  expect(material.defines?.["JG_GEN_GROUND"]).toBeUndefined();
  const shader = fakeShader();
  // type-escape: the fake shader stands in for three's program parameters, as in the tests above.
  material.onBeforeCompile?.(shader as never, undefined as never);
  expect(shader.uniforms["uGenAlbedo"]?.value).toBe(surfaces?.textures.albedo);
  expect(shader.fragmentShader).toContain("jgGenProject(JG_GEN_ROCK");
  expect(material.customProgramCacheKey()).toContain("JG_GEN_ROCK1.0");
  surfaces?.dispose();
});

test("surfaces that bake at different sizes are rebaked to the smallest so they stack", () => {
  const detail = resolveTerrainDetail({ surfaces: { ground: { preset: "grass", params: { resolution: "128" } }, sand: { preset: "sand", params: { resolution: "64" } } } });
  const surfaces = createTerrainSurfaceTextures(detail.surfaces);
  expect(surfaces?.textures.albedo.image.width).toBe(64);
  surfaces?.dispose();
});
