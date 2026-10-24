import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { CSM } from "three/examples/jsm/csm/CSM.js";

import { resolveGraphicsProfile } from "@jgengine/core/settings/graphicsProfile";

import { cascadeTexelSize, createCascadeRefreshState, refreshCascadesOnTexelStep } from "./CascadedShadows";
import {
  minShadowCasterRadius,
  resolveCascadeCount,
  resolveShadowMapSize,
} from "./shadowTiers";

describe("shadow map size by tier", () => {
  test("a game's authored size is a ceiling the tier caps, never a floor it raises", () => {
    expect(resolveShadowMapSize(resolveGraphicsProfile("low"), 2048)).toBe(512);
    expect(resolveShadowMapSize(resolveGraphicsProfile("medium"), 2048)).toBe(1024);
    expect(resolveShadowMapSize(resolveGraphicsProfile("high"), 2048)).toBe(2048);
    expect(resolveShadowMapSize(resolveGraphicsProfile("ultra"), 2048)).toBe(2048);
    // A game that asks for less than its tier pays keeps its own size.
    expect(resolveShadowMapSize(resolveGraphicsProfile("ultra"), 1024)).toBe(1024);
  });

  test("a game that authors no size renders at the tier's", () => {
    expect(resolveShadowMapSize(resolveGraphicsProfile("low"))).toBe(512);
    expect(resolveShadowMapSize(resolveGraphicsProfile("ultra"))).toBe(4096);
    expect(resolveShadowMapSize(undefined, 2048)).toBe(2048);
    expect(resolveShadowMapSize(undefined)).toBe(1024);
  });
});

describe("cascade count by tier", () => {
  test("lower tiers pay for fewer cascades", () => {
    expect(resolveCascadeCount(resolveGraphicsProfile("low"), 3)).toBe(1);
    expect(resolveCascadeCount(resolveGraphicsProfile("medium"), 3)).toBe(2);
    expect(resolveCascadeCount(resolveGraphicsProfile("high"), 3)).toBe(3);
    expect(resolveCascadeCount(resolveGraphicsProfile("ultra"), 3)).toBe(3);
    expect(resolveCascadeCount(resolveGraphicsProfile("low"), 4)).toBe(1);
    expect(resolveCascadeCount(resolveGraphicsProfile("medium"), 2)).toBe(2);
  });

  test("no tier raises a game's authored cascade count", () => {
    expect(resolveCascadeCount(resolveGraphicsProfile("ultra"), 2)).toBe(2);
    expect(resolveCascadeCount(undefined, 2)).toBe(2);
    expect(resolveCascadeCount(undefined)).toBe(3);
  });
});

describe("cascade light texel snapping", () => {
  const direction = new THREE.Vector3(-0.5, -1, -0.4).normalize();
  const cascadeLight = () => {
    const light = new THREE.DirectionalLight();
    const camera = light.shadow.camera as THREE.OrthographicCamera;
    camera.left = -10;
    camera.right = 10;
    camera.top = 10;
    camera.bottom = -10;
    light.shadow.mapSize.set(2048, 2048);
    light.castShadow = true;
    light.target.position.set(0, 0, 0);
    return light;
  };

  test("a light that does not move costs no depth pass", () => {
    const light = cascadeLight();
    light.position.set(12, 30, 8);
    const state = createCascadeRefreshState(0);
    refreshCascadesOnTexelStep([light], direction, state);
    const afterFirst = state.refreshes;
    for (let frame = 0; frame < 60; frame++) refreshCascadesOnTexelStep([light], direction, state);
    expect(afterFirst).toBe(1);
    expect(state.refreshes).toBe(1);
    expect(light.shadow.autoUpdate).toBe(false);
  });

  test("a move inside one texel refreshes zero times, a crossing refreshes once", () => {
    const light = cascadeLight();
    light.position.set(0, 30, 0);
    const state = createCascadeRefreshState(0);
    const texel = cascadeTexelSize(light);
    expect(texel).toBeCloseTo(20 / 2048, 6);
    refreshCascadesOnTexelStep([light], direction, state);
    const base = state.refreshes;
    light.position.x += texel * 0.4;
    expect(refreshCascadesOnTexelStep([light], direction, state)).toBe(0);
    expect(state.refreshes).toBe(base);
    light.position.x += texel * 1.2;
    expect(refreshCascadesOnTexelStep([light], direction, state)).toBe(1);
    expect(state.refreshes).toBe(base + 1);
  });

  test("the depth pass never outruns the quantised step", () => {
    const light = cascadeLight();
    const state = createCascadeRefreshState(0);
    const texel = cascadeTexelSize(light);
    let steps = 0;
    let previous: number | undefined;
    for (let frame = 0; frame < 40; frame++) {
      light.position.set(frame * texel * 0.5, 30, 0);
      refreshCascadesOnTexelStep([light], direction, state);
      const snapped = light.position.x;
      if (previous !== undefined && snapped !== previous) steps += 1;
      previous = snapped;
    }
    expect(state.refreshes).toBeLessThanOrEqual(steps + 1);
    expect(state.refreshes).toBeLessThan(40);
  });
});

describe("the smallest shadow worth a depth draw", () => {
  test("grows as the map shrinks and never shrinks below the measured radius", () => {
    expect(minShadowCasterRadius(2048)).toBe(0.5);
    expect(minShadowCasterRadius(4096)).toBe(0.5);
    expect(minShadowCasterRadius(1024)).toBe(1);
    expect(minShadowCasterRadius(512)).toBe(2);
  });
});
