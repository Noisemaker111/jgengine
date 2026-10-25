import { afterEach, describe, expect, test } from "bun:test";
import * as THREE from "three";

import { DRY_SECONDS, WET_SECONDS, advanceLivingWorld, livingWorld, reportRain, reportWind, resetLivingWorld, stepWetness, wetnessUniform } from "./livingWorld";
import { birdPresence, flockFocus, gustForWind, steamDensity } from "./LivingWorldLayer";
import { applyWetness, applyWetnessToScene, takesWetness } from "./wetSurfaces";

afterEach(resetLivingWorld);

describe("living world", () => {
  test("surfaces soak in steady rain and dry slowly after", () => {
    let wetness = 0;
    for (let t = 0; t < WET_SECONDS; t += 0.5) wetness = stepWetness(wetness, 1, 0.5);
    expect(wetness).toBeCloseTo(1, 5);
    wetness = stepWetness(wetness, 0, DRY_SECONDS / 2);
    expect(wetness).toBeCloseTo(0.5, 5);
    expect(stepWetness(0.5, 0, DRY_SECONDS)).toBe(0);
    expect(stepWetness(0, 0.3, 1)).toBeLessThan(0.1);
  });

  test("a world that opens in rain starts soaked; later rain soaks it gradually", () => {
    const field = {};
    reportRain(field, 0.8);
    advanceLivingWorld(1 / 60, 0.5);
    expect(livingWorld.wetness).toBe(1);
    expect(wetnessUniform.value).toBe(1);
    resetLivingWorld();
    for (let frame = 0; frame < 300; frame += 1) advanceLivingWorld(1 / 60, 0.5);
    reportRain(field, 0.8);
    advanceLivingWorld(1 / 60, 0.5);
    expect(livingWorld.wetness).toBeLessThan(0.01);
  });

  test("rain is the strongest source, wind sums, and withdrawing stops both", () => {
    const a = {};
    const b = {};
    reportRain(a, 0.3);
    reportRain(b, 0.7);
    reportWind(a, [2, 0]);
    reportWind(b, [0, 3]);
    advanceLivingWorld(0.016, null);
    expect(livingWorld.rain).toBe(0.7);
    expect(livingWorld.wind.x).toBe(2);
    expect(livingWorld.wind.y).toBe(3);
    reportRain(a, 0);
    reportRain(b, 0);
    reportWind(a, null);
    reportWind(b, null);
    advanceLivingWorld(0.016, null);
    expect(livingWorld.rain).toBe(0);
    expect(livingWorld.wind.length()).toBe(0);
  });

  test("birds keep to fair daylight, steam thickens in cold and wet, wind bends plants harder", () => {
    expect(birdPresence(0.6, 0)).toBe(1);
    expect(birdPresence(0.6, 0.5)).toBe(0);
    expect(birdPresence(-0.1, 0)).toBe(0);
    expect(birdPresence(null, 0)).toBe(0);
    expect(steamDensity(-0.2, 0)).toBeGreaterThan(steamDensity(0.8, 0));
    expect(steamDensity(0.8, 1)).toBeGreaterThan(steamDensity(0.8, 0));
    expect(gustForWind(0)).toBe(1);
    expect(gustForWind(100)).toBe(2.5);
  });

  test("the flock circles the ground in view: below a top-down camera, ahead of a level one", () => {
    const top = new THREE.PerspectiveCamera();
    top.position.set(10, 60, 0);
    top.lookAt(10, 0, 0.001);
    top.updateMatrixWorld();
    const below = flockFocus(top, new THREE.Vector3());
    expect(below.x).toBeCloseTo(10, 1);
    expect(below.y).toBe(0);
    const level = new THREE.PerspectiveCamera();
    level.position.set(0, 2, 0);
    level.lookAt(0, 2, -10);
    level.updateMatrixWorld();
    expect(flockFocus(level, new THREE.Vector3()).z).toBeCloseTo(-40, 3);
  });

  test("the wet layer patches lit opaque surfaces once and leaves glass, water and custom shaders alone", () => {
    const ground = new THREE.MeshStandardMaterial();
    expect(takesWetness(ground)).toBe(true);
    applyWetness(ground);
    expect(takesWetness(ground)).toBe(false);
    const key = ground.customProgramCacheKey();
    applyWetness(ground);
    expect(ground.customProgramCacheKey()).toBe(key);
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: "#include <common>\n#include <worldpos_vertex>",
      fragmentShader: "#include <common>\n#include <metalnessmap_fragment>\n#include <normal_fragment_maps>",
    };
    ground.onBeforeCompile(shader as never, {} as never);
    expect(shader.uniforms.uJgWetness).toBe(wetnessUniform);
    expect(shader.fragmentShader).toContain("jgPuddle");
    expect(shader.vertexShader).toContain("vJgWetWorld");

    expect(takesWetness(new THREE.MeshPhysicalMaterial({ transmission: 1 }))).toBe(false);
    expect(takesWetness(new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 }))).toBe(false);
    expect(takesWetness(new THREE.MeshStandardMaterial({ transparent: true }))).toBe(true);
    expect(takesWetness(new THREE.ShaderMaterial())).toBe(false);
    const water = new THREE.MeshStandardMaterial();
    water.userData.noWetness = true;
    expect(takesWetness(water)).toBe(false);

    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    expect(applyWetnessToScene(root)).toBe(1);
    expect(applyWetnessToScene(root)).toBe(0);
  });
});
