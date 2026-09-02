import { describe, expect, it } from "bun:test";

import { CINEMATIC_POST_PROCESSING, CINEMATIC_SKY, NEUTRAL_POST_PROCESSING, PHOTOREAL_POST_PROCESSING, TOON_POST_PROCESSING, resolveGameLook } from "./lookPreset";

describe("resolveGameLook", () => {
  it("defaults to neutral without injecting a stylistic rig", () => {
    const look = resolveGameLook({});
    expect(look.backdrop).toBeUndefined();
    expect(look.postProcessing).toEqual(NEUTRAL_POST_PROCESSING);
  });

  it('cinematic post stack carries tonemap + bloom + gentle SSAO + grade/vignette', () => {
    const look = resolveGameLook({ look: "photoreal" });
    expect(look.postProcessing).toEqual(PHOTOREAL_POST_PROCESSING);
  });

  it('cinematic leaves the sky to the world when the world already declares one', () => {
    const look = resolveGameLook({ look: "cinematic", hasWorldSky: true });
    expect(look.backdrop).toBeUndefined();
    expect(look.postProcessing).toEqual(CINEMATIC_POST_PROCESSING);
  });

  it("selects the neutral and toon profiles exactly", () => {
    expect(resolveGameLook({ look: "neutral" }).postProcessing).toEqual(NEUTRAL_POST_PROCESSING);
    expect(resolveGameLook({ look: "toon" }).postProcessing).toEqual(TOON_POST_PROCESSING);
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
    const look = resolveGameLook({ look: "cinematic", backdrop: { background: "#101014" } });
    expect(look.backdrop?.background).toBe("#101014");
    expect(look.backdrop?.sky).toEqual(CINEMATIC_SKY);
  });
});
