import { describe, expect, test } from "bun:test";

import * as THREE from "three";

import { buildRoadRibbon } from "@jgengine/core/world/roads";

import {
  createSurfaceRibbonMaterial,
  resolvePathSurface,
  ribbonEdgeMargin,
  ribbonSurfaceFrame,
} from "./surfaceRibbonMaterial";

describe("resolvePathSurface", () => {
  test("routes default to dirt with a soft edge and ruts", () => {
    const style = resolvePathSurface("route", 5, undefined)!;
    expect(style.surface).toBe("dirt");
    expect(style.feather).toBeGreaterThan(0.5);
    expect(style.wear).toBe(1);
  });

  test("road kind paves with a near-hard edge", () => {
    const style = resolvePathSurface("road", 9, undefined)!;
    expect(style.surface).toBe("road");
    expect(style.feather).toBeLessThan(0.4);
    expect(style.wear).toBeLessThan(1);
  });

  test("meta.surface picks the surface and meta overrides tune it", () => {
    const style = resolvePathSurface("route", 4, { surface: "gravel", edgeSoftness: 0, wear: 0.2 })!;
    expect(style.surface).toBe("gravel");
    expect(style.feather).toBe(0);
    expect(ribbonEdgeMargin(style)).toBe(0);
    expect(style.wear).toBeCloseTo(0.2);
  });

  test("opt-out returns null", () => {
    expect(resolvePathSurface("route", 4, { surfaceDetail: false })).toBeNull();
    expect(resolvePathSurface("route", 4, { surface: false })).toBeNull();
  });
});

describe("ribbonSurfaceFrame", () => {
  test("measures along, signed across and distance to end per ribbon", () => {
    const ribbon = buildRoadRibbon([[0, 0], [0, 10]], 4, () => 0, { maxSegmentLength: 5 });
    const frame = ribbonSurfaceFrame([ribbon.positions, ribbon.positions]);
    expect(frame.length).toBe(ribbon.positions.length * 2);
    expect(frame[0]).toBe(0);
    expect(Math.abs(frame[1]!)).toBeCloseTo(2);
    expect(frame[4]).toBeCloseTo(-frame[1]!);
    expect(frame[2]).toBeCloseTo(10);
    const last = ribbon.positions.length - 6;
    expect(frame[last]).toBeCloseTo(10);
    expect(frame[last + 2]).toBeCloseTo(0);
    // The second ribbon restarts at its own start.
    expect(frame[ribbon.positions.length]).toBe(0);
  });
});

describe("createSurfaceRibbonMaterial", () => {
  test("soft edge turns on blending and the edge define; hard edge stays opaque", () => {
    const soft = createSurfaceRibbonMaterial({ color: "#96764e", halfWidth: 2.5, surface: "dirt", feather: 0.9, warp: 0.4, wear: 1 });
    expect(soft.transparent).toBe(true);
    expect(soft.defines?.["JG_RIBBON_EDGE"]).toBe("");
    expect(soft.defines?.["JG_RIBBON_WEAR"]).toBe("");
    const hard = createSurfaceRibbonMaterial({ color: "#33363f", halfWidth: 4.5, surface: "asphalt", quality: "low" });
    expect(hard.transparent).toBe(false);
    expect(hard.defines?.["JG_RIBBON_EDGE"]).toBeUndefined();
    expect(hard.defines?.["JG_SURFACE_LOW"]).toBe("");
    expect(hard.defines?.["JG_RIBBON_PAVED"]).toBe("");
    expect(hard.customProgramCacheKey()).not.toBe(soft.customProgramCacheKey());
  });
});

describe("ribbon slabs and scans", () => {
  const textures = { color: new THREE.Texture(), normal: new THREE.Texture(), ao: new THREE.Texture() };

  test("slabs lay a joint grid on the ribbon frame and get their own program", () => {
    const poured = createSurfaceRibbonMaterial({ color: "#cdc6b6", halfWidth: 2.1, surface: "pavement" });
    const slabs = createSurfaceRibbonMaterial({ color: "#cdc6b6", halfWidth: 2.1, surface: "pavement", slabs: [1.5, 1.4] });
    expect(poured.defines?.["JG_RIBBON_SLABS"]).toBeUndefined();
    expect(slabs.defines?.["JG_RIBBON_SLABS"]).toBe("");
    expect(slabs.customProgramCacheKey()).not.toBe(poured.customProgramCacheKey());
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} as Record<string, { value: unknown }> };
    slabs.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect((shader.uniforms["uJgSlab"]!.value as THREE.Vector2).toArray()).toEqual([1.5, 1.4]);
    expect(shader.fragmentShader).toContain("jgJointD");
  });

  test("a scan compiles its maps in, world-tiled by default and frame-tiled on request", () => {
    const world = createSurfaceRibbonMaterial({ color: "#33363f", halfWidth: 7, surface: "road", scan: { textures, repeat: 4, strength: 1, tint: 1 } });
    const frame = createSurfaceRibbonMaterial({ color: "#cdc6b6", halfWidth: 2, surface: "pavement", scan: { textures, repeat: 3, strength: 1, tint: 0, projection: "frame" } });
    const plain = createSurfaceRibbonMaterial({ color: "#33363f", halfWidth: 7, surface: "road" });
    expect(world.defines?.["JG_SCAN"]).toBe("");
    expect(world.defines?.["JG_SCAN_AO"]).toBe("");
    expect(world.defines?.["JG_SCAN_ROUGH"]).toBeUndefined();
    expect(world.defines?.["JG_SCAN_FRAME"]).toBeUndefined();
    expect(frame.defines?.["JG_SCAN_FRAME"]).toBe("");
    expect(new Set([world, frame, plain].map((m) => m.customProgramCacheKey())).size).toBe(3);
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} as Record<string, { value: unknown }> };
    world.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(shader.uniforms["uScanColor"]!.value).toBe(textures.color);
    expect(shader.uniforms["uScanRepeat"]!.value).toBe(4);
    expect(shader.fragmentShader).toContain("jgScanPerturb(normal");
    expect(shader.fragmentShader).toContain("reflectedLight.indirectDiffuse *= mix(1.0, JG_SCAN_SAMPLE(uScanAo).r");
  });
});
