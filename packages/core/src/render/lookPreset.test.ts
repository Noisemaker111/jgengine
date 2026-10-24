import { describe, expect, it } from "bun:test";

import { CINEMATIC_POST_PROCESSING, COMIC_POST_PROCESSING, RETRO_POST_PROCESSING, CINEMATIC_SKY, NEUTRAL_POST_PROCESSING, PHOTOREAL_POST_PROCESSING, TOON_POST_PROCESSING, mergePostProcessing, resolveGameLook, type GameLookInput } from "./lookPreset";
import { resolveMood } from "./lookMood";

describe("resolveGameLook", () => {
  it("defaults to neutral without injecting a stylistic rig", () => {
    const look = resolveGameLook({});
    expect(look.backdrop).toBeUndefined();
    expect(look.postProcessing).toEqual(NEUTRAL_POST_PROCESSING);
  });

  it('cinematic post stack carries tonemap + bloom + gentle SSAO + grade/vignette', () => {
    const look = resolveGameLook({ look: "photoreal" });
    expect(look.postProcessing).toMatchObject(PHOTOREAL_POST_PROCESSING);
  });

  it('cinematic leaves the sky to the world when the world already declares one', () => {
    const look = resolveGameLook({ look: "cinematic", hasWorldSky: true });
    expect(look.backdrop?.sky).toBeUndefined();
    expect(look.postProcessing).toMatchObject(CINEMATIC_POST_PROCESSING);
  });

  it("selects the neutral and toon profiles exactly", () => {
    expect(resolveGameLook({ look: "neutral" }).postProcessing).toEqual(NEUTRAL_POST_PROCESSING);
    expect(resolveGameLook({ look: "toon" }).postProcessing).toMatchObject(TOON_POST_PROCESSING);
  });

  it("comic and retro select their stylized chains and a sky", () => {
    const comic = resolveGameLook({ look: "comic" });
    expect(comic.postProcessing).toMatchObject(COMIC_POST_PROCESSING);
    expect(comic.backdrop?.sky).toMatchObject(CINEMATIC_SKY);
    expect(resolveGameLook({ look: "retro" }).postProcessing).toMatchObject(RETRO_POST_PROCESSING);
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
    expect(look.backdrop?.sky).toMatchObject(CINEMATIC_SKY);
  });

  it("styled presets deep-merge their stages under a partial game chain", () => {
    const look = resolveGameLook({ look: "comic", postProcessing: { bloom: { strength: 0.5 }, grade: { vignette: 0 } } });
    expect(look.postProcessing?.stylize).toEqual(COMIC_POST_PROCESSING.stylize);
    expect(look.postProcessing?.ao).toEqual(COMIC_POST_PROCESSING.ao);
    expect(look.postProcessing?.bloom).toEqual({ strength: 0.5, radius: 0.4, threshold: 1 });
    expect(look.postProcessing?.grade).toMatchObject({ saturation: 1.3, gamma: 0.94, vignette: 0, grain: 0 });
    expect(look.postProcessing?.aa).toBe("msaa");
  });

  it("a game's explicit false and scalar values win over the preset", () => {
    const look = resolveGameLook({ look: "cinematic", postProcessing: { toneMapping: "agx", ao: false } });
    expect(look.postProcessing).toMatchObject({ toneMapping: "agx", bloom: {}, ao: false });
  });

  it("neutral leaves AO to the tier default", () => {
    expect(NEUTRAL_POST_PROCESSING.ao).toBeUndefined();
  });
});

describe("resolveGameLook mood", () => {
  const keyOf = (look: ReturnType<typeof resolveGameLook>) => look.lighting?.directional?.[0];

  it("a styled look with no light rig is lit by the day mood", () => {
    const look = resolveGameLook({ look: "cinematic" });
    const day = resolveMood("day");
    expect(look.lighting).toEqual(day.lighting);
    expect(keyOf(look)).toMatchObject({ castShadow: true, cascades: 3 });
    expect(look.backdrop?.fog).toEqual(day.fog);
    expect(look.backdrop?.sky).toEqual(day.sky);
    expect(look.postProcessing?.exposure).toBe(day.postProcessing.exposure);
  });

  it("an authored key or fill keeps the game's own rig and post", () => {
    const lighting = { directional: [{ intensity: 2, position: [1, 2, 3] as [number, number, number] }] };
    const look = resolveGameLook({ look: "cinematic", lighting });
    expect(look.lighting).toBe(lighting);
    expect(look.postProcessing).toEqual(CINEMATIC_POST_PROCESSING);
  });

  it("a day-cycle sky keeps its moving sun instead of a mood rig", () => {
    const look = resolveGameLook({ look: "cinematic", worldSky: { preset: "day", timeOfDay: true } });
    expect(look.lighting).toBeUndefined();
  });

  it("a dusk or night world sky implies the matching mood without repainting the world", () => {
    const worldSky = { preset: "dusk" as const, zenithColor: "#123456" };
    const look = resolveGameLook({ look: "cinematic", worldSky });
    expect(keyOf(look)?.color).toBe(resolveMood("dusk").lighting.directional?.[0]?.color);
    expect(look.backdrop?.sky).toBeUndefined();
    expect(resolveGameLook({ look: "toon", worldSky: { preset: "night" } }).lighting).toEqual(resolveMood({ preset: "night" }).lighting);
  });

  it("an explicit mood repaints the world sky but keeps its shape", () => {
    const worldSky = { preset: "day" as const, radius: 620, cloudiness: 0.1, hazeStrength: 0.2, zenithColor: "#000000" };
    const look = resolveGameLook({ look: "cinematic", mood: "golden", worldSky });
    const golden = resolveMood("golden").sky;
    expect(look.backdrop?.sky).toMatchObject({ radius: 620, cloudiness: 0.1, hazeStrength: 0.2, zenithColor: golden.zenithColor, sun: golden.sun });
  });

  it("the scene document's sky wins over the mood and places its sun", () => {
    const look = resolveGameLook({ look: "cinematic", mood: "day", documentSky: { horizonColor: "#ff0000", sun: { azimuth: 90, elevation: 30 } } });
    expect(look.backdrop?.sky).toMatchObject({ horizonColor: "#ff0000", sun: { azimuth: 90, elevation: 30 } });
    const [x, y, z] = keyOf(look)!.position!;
    expect(Math.abs(z)).toBeLessThan(1e-6);
    expect((Math.atan2(y, x) * 180) / Math.PI).toBeCloseTo(30, 5);
  });

  it("the sky's sun and ambient strength scale the mood rig", () => {
    const base = resolveGameLook({ look: "cinematic", mood: "day" });
    const tuned = resolveGameLook({ look: "cinematic", mood: "day", documentSky: { sunIntensity: 2, ambientIntensity: 0.3 } });
    expect(keyOf(tuned)!.intensity).toBeCloseTo(keyOf(base)!.intensity! * 2, 6);
    expect(tuned.lighting!.hemisphere!.intensity).toBeCloseTo(base.lighting!.hemisphere!.intensity! * 0.5, 6);
  });

  it("authored lighting fields replace the mood's one by one and lamps add to it", () => {
    const ambient = { color: "#ffffff", intensity: 0.1 };
    const point = [{ position: [0, 2, 0] as [number, number, number] }];
    const look = resolveGameLook({ look: "cinematic", mood: "night", lighting: { ambient, point } });
    expect(look.lighting?.ambient).toBe(ambient);
    expect(look.lighting?.point).toBe(point);
    expect(look.lighting?.directional).toEqual(resolveMood("night").lighting.directional);
    expect(resolveGameLook({ look: "cinematic", lighting: { point } }).lighting?.directional).toEqual(resolveMood("day").lighting.directional);
  });

  it("the style's grade values win over the mood tint, a mood token wins over the style", () => {
    const comic = resolveGameLook({ look: "comic", mood: "golden" });
    expect(comic.postProcessing?.grade).toMatchObject({ saturation: 1.3, gain: resolveMood("golden").postProcessing.grade!.gain });
    const tuned = resolveGameLook({ look: "comic", mood: { preset: "golden", saturation: 1.5, exposure: 0.8 } });
    expect(tuned.postProcessing).toMatchObject({ exposure: 0.8, grade: { saturation: 1.5 } });
    expect(resolveGameLook({ look: "comic", mood: "day", postProcessing: { grade: { saturation: 2 } } }).postProcessing?.grade).toMatchObject({ saturation: 2 });
  });

  it("an authored backdrop sky and fog win over the mood", () => {
    const backdrop = { sky: { preset: "night" as const }, fog: { color: "#000", near: 1, far: 2 } };
    expect(resolveGameLook({ look: "cinematic", mood: "bright", backdrop }).backdrop).toBe(backdrop);
  });

  it("resolving an already-resolved look returns the same look", () => {
    const inputs: GameLookInput[] = [
      { look: "cinematic" },
      { look: "cinematic", mood: "golden", worldSky: { preset: "day", radius: 600 } },
      { look: "comic", worldSky: { preset: "dusk" } },
      { look: "neutral", mood: { preset: "overcast", fog: false } },
      { look: "cinematic", mood: "day", documentSky: { sunIntensity: 1.5, sun: { azimuth: 30 } } },
    ];
    for (const input of inputs) {
      const once = resolveGameLook(input);
      const twice = resolveGameLook({ ...input, lighting: once.lighting, backdrop: once.backdrop, postProcessing: once.postProcessing });
      expect(twice).toEqual(once);
    }
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
