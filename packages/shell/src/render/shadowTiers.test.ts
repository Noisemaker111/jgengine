import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { resolveGraphicsProfile } from "@jgengine/core/settings/graphicsProfile";

import { scheduleCascadeRefresh } from "./CascadedShadows";
import {
  minShadowCasterRadius,
  resolveCascadeCount,
  resolveShadowMapSize,
  shadowRefreshScale,
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

describe("far-cascade refresh by tier", () => {
  test("high and ultra keep the cadence the rig was measured with", () => {
    expect(shadowRefreshScale(2048)).toBe(1);
    expect(shadowRefreshScale(4096)).toBe(1);
    expect(shadowRefreshScale(1024)).toBe(2);
    expect(shadowRefreshScale(512)).toBe(2);
  });

  test("a stretched cadence halves how often each far cascade draws", () => {
    const count = (scale: number) => {
      const lights = Array.from({ length: 3 }, () => new THREE.DirectionalLight());
      const refreshes = [0, 0, 0];
      for (let frame = 0; frame < 8; frame++) {
        scheduleCascadeRefresh(lights, frame, scale);
        lights.forEach((light, index) => {
          if (light.shadow.autoUpdate || light.shadow.needsUpdate) {
            refreshes[index]! += 1;
            light.shadow.needsUpdate = false;
          }
        });
      }
      return refreshes;
    };
    expect(count(1)).toEqual([8, 4, 2]);
    expect(count(2)).toEqual([8, 2, 1]);
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
