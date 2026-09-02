import { describe, expect, it } from "bun:test";

import { DEFAULT_GRAPHICS_PROFILES, resolveGraphicsProfile } from "./graphicsProfile";

describe("resolveGraphicsProfile", () => {
  it("returns the tier defaults", () => {
    expect(resolveGraphicsProfile("low")).toEqual(DEFAULT_GRAPHICS_PROFILES.low);
    expect(resolveGraphicsProfile("high")).toEqual(DEFAULT_GRAPHICS_PROFILES.high);
  });

  it("merges partial fields and nested post stages without mutating defaults", () => {
    const profile = resolveGraphicsProfile("medium", {
      renderScale: 1.25,
      postStages: { ao: false },
    });
    expect(profile.renderScale).toBe(1.25);
    expect(profile.shadowMapSize).toBe(1024);
    expect(profile.postStages).toEqual({ ao: false, bloom: true, dof: true, smaa: true });
    expect(DEFAULT_GRAPHICS_PROFILES.medium.postStages.ao).toBe(true);
  });
});
