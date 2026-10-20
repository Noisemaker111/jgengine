import { describe, expect, it } from "bun:test";

import { CINEMATIC_POST_PROCESSING, COMIC_POST_PROCESSING, RETRO_POST_PROCESSING, CINEMATIC_SKY, NEUTRAL_POST_PROCESSING, PHOTOREAL_POST_PROCESSING, TOON_POST_PROCESSING, mergePostProcessing, resolveGameLook } from "./lookPreset";

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

  it("comic and retro select their stylized chains and a sky", () => {
    const comic = resolveGameLook({ look: "comic" });
    expect(comic.postProcessing).toEqual(COMIC_POST_PROCESSING);
    expect(comic.backdrop?.sky).toEqual(CINEMATIC_SKY);
    expect(resolveGameLook({ look: "retro" }).postProcessing).toEqual(RETRO_POST_PROCESSING);
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

  it("styled presets deep-merge their stages under a partial game chain", () => {
    const look = resolveGameLook({ look: "comic", postProcessing: { bloom: { strength: 0.5 }, grade: { vignette: 0 } } });
    expect(look.postProcessing?.stylize).toEqual(COMIC_POST_PROCESSING.stylize);
    expect(look.postProcessing?.ao).toEqual(COMIC_POST_PROCESSING.ao);
    expect(look.postProcessing?.bloom).toEqual({ strength: 0.5, radius: 0.4, threshold: 1 });
    expect(look.postProcessing?.grade).toEqual({ saturation: 1.3, gamma: 0.94, vignette: 0, grain: 0 });
    expect(look.postProcessing?.aa).toBe("msaa");
  });

  it("a game's explicit false and scalar values win over the preset", () => {
    const look = resolveGameLook({ look: "cinematic", postProcessing: { toneMapping: "agx", ao: false } });
    expect(look.postProcessing).toEqual({ toneMapping: "agx", bloom: {}, ao: false, grade: {} });
  });

  it("neutral leaves AO to the tier default", () => {
    expect(NEUTRAL_POST_PROCESSING.ao).toBeUndefined();
  });
});

describe("mergePostProcessing", () => {
  it("replaces tuples whole and lets an authored object replace a preset false", () => {
    const merged = mergePostProcessing({ grade: { lift: [0, 0, 0], gamma: 1 }, bloom: false }, { grade: { lift: [0.1, 0.1, 0.1] }, bloom: { strength: 1 } });
    expect(merged).toEqual({ grade: { lift: [0.1, 0.1, 0.1], gamma: 1 }, bloom: { strength: 1 } });
  });

  it("does not mutate the preset", () => {
    const preset = { ao: { intensity: 1 } };
    mergePostProcessing(preset, { ao: { radius: 2 } });
    expect(preset).toEqual({ ao: { intensity: 1 } });
  });
});
