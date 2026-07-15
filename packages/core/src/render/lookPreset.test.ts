import { describe, expect, it } from "bun:test";

import { CINEMATIC_POST_PROCESSING, CINEMATIC_SKY, resolveGameLook } from "./lookPreset";

describe("resolveGameLook", () => {
  it("defaults to cinematic when look is unset — wires sky + post so a bare scene reads lit", () => {
    const look = resolveGameLook({});
    expect(look.backdrop?.sky).toEqual(CINEMATIC_SKY);
    expect(look.postProcessing).toEqual(CINEMATIC_POST_PROCESSING);
  });

  it('cinematic post stack carries tonemap + bloom + gentle SSAO + grade/vignette', () => {
    const look = resolveGameLook({});
    expect(look.postProcessing?.toneMapping).toBe("aces");
    expect(look.postProcessing?.bloom).toBeDefined();
    expect(look.postProcessing?.ao).toBeDefined();
    expect(look.postProcessing?.grade).toBeDefined();
  });

  it('cinematic leaves the sky to the world when the world already declares one', () => {
    const look = resolveGameLook({ hasWorldSky: true });
    expect(look.backdrop).toBeUndefined();
    expect(look.postProcessing).toEqual(CINEMATIC_POST_PROCESSING);
  });

  it('flat opts out — passes explicit knobs through untouched and adds nothing', () => {
    const look = resolveGameLook({ look: "flat" });
    expect(look.backdrop).toBeUndefined();
    expect(look.lighting).toBeUndefined();
    expect(look.postProcessing).toBeUndefined();
  });

  it("explicit lighting/backdrop/postProcessing always win over the preset", () => {
    const lighting = { ambient: { intensity: 0.2 } };
    const backdrop = { sky: { preset: "night" as const }, fog: { color: "#000" } };
    const postProcessing = { bloom: false as const };
    const look = resolveGameLook({ lighting, backdrop, postProcessing });
    expect(look.lighting).toBe(lighting);
    expect(look.backdrop).toBe(backdrop);
    expect(look.postProcessing).toBe(postProcessing);
  });

  it("cinematic fills the sky while preserving an authored background/fog", () => {
    const look = resolveGameLook({ backdrop: { background: "#101014" } });
    expect(look.backdrop?.background).toBe("#101014");
    expect(look.backdrop?.sky).toEqual(CINEMATIC_SKY);
  });
});
