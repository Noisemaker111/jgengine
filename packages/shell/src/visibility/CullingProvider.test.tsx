import { describe, expect, test } from "bun:test";

import { DEFAULT_GRAPHICS_PROFILES } from "@jgengine/core/settings/graphicsProfile";

import { resolveProviderCullPolicy } from "./CullingProvider";

describe("CullingProvider cull policy", () => {
  test("each tier's profile distance reaches batched instances", () => {
    for (const tier of ["low", "medium", "high"] as const) {
      const policy = resolveProviderCullPolicy(tier, DEFAULT_GRAPHICS_PROFILES[tier].drawDistance, undefined);
      expect(policy.maxDistance).toBe(DEFAULT_GRAPHICS_PROFILES[tier].drawDistance);
    }
  });

  test("ultra stays unbounded, and a game's scene override still wins", () => {
    expect(resolveProviderCullPolicy("ultra", DEFAULT_GRAPHICS_PROFILES.ultra.drawDistance, undefined).maxDistance).toBe(Number.POSITIVE_INFINITY);
    expect(resolveProviderCullPolicy("low", 120, { culling: { defaultMaxRenderDistance: 333 } }).maxDistance).toBe(333);
  });
});
