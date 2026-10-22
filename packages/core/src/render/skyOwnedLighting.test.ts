import { describe, expect, test } from "bun:test";

import { skyNoonKeyframes, splitSkyOwnedLighting } from "./skyOwnedLighting";

const lighting = {
  ambient: { color: "#ffe4c0", intensity: 0.18 },
  hemisphere: { skyColor: "#a9d8ef", groundColor: "#b09a6f", intensity: 0.34 },
  directional: [
    { color: "#fff0cf", intensity: 2.05, position: [170, 74, 44] as [number, number, number], castShadow: true, cascades: 3 },
    { color: "#8fbcdc", intensity: 0.26, position: [-170, 44, -70] as [number, number, number] },
  ],
  point: [{ position: [1, 2, 3] as [number, number, number], intensity: 2 }],
  maxDynamicLights: 4,
};

describe("splitSkyOwnedLighting", () => {
  test("the first directional is the sun and remains the sky's noon keyframe", () => {
    const { sky } = splitSkyOwnedLighting(lighting);
    expect(sky.directional?.length).toBe(1);
    expect(sky.directional?.[0]?.intensity).toBe(2.05);
    expect(sky.directional?.[0]?.color).toBe("#fff0cf");
    expect(sky.ambient).toEqual(lighting.ambient);
    expect(sky.hemisphere).toEqual(lighting.hemisphere);
  });

  test("fill, point and budget stay mounted as authored", () => {
    const { rest } = splitSkyOwnedLighting(lighting);
    expect(rest.directional?.length).toBe(1);
    expect(rest.directional?.[0]?.color).toBe("#8fbcdc");
    expect(rest.point).toEqual(lighting.point);
    expect(rest.maxDynamicLights).toBe(4);
    expect(rest.ambient).toBeUndefined();
    expect(rest.hemisphere).toBeUndefined();
  });

  test("splitting keeps every authored light exactly once", () => {
    const { sky, rest } = splitSkyOwnedLighting(lighting);
    expect((sky.directional?.length ?? 0) + (rest.directional?.length ?? 0)).toBe(lighting.directional.length);
    expect([sky.ambient, sky.hemisphere, rest.ambient, rest.hemisphere].filter((entry) => entry !== undefined).length).toBe(2);
  });

  test("no authored sun leaves the sky empty so engine defaults still apply", () => {
    const { sky, rest } = splitSkyOwnedLighting({ point: lighting.point });
    expect(sky.directional).toBeUndefined();
    expect(sky.ambient).toBeUndefined();
    expect(rest.point).toEqual(lighting.point);
  });

  test("missing lighting splits into empties, not undefined", () => {
    expect(splitSkyOwnedLighting(undefined)).toEqual({ sky: {}, rest: {} });
  });
});

describe("skyNoonKeyframes", () => {
  const sky = { preset: "day" as const, timeOfDay: true, horizonColor: "#eadcc4" };

  test("fills sun, fill, tint and fog from authored lighting", () => {
    expect(skyNoonKeyframes(sky, lighting, "#b9cfd8")).toEqual({
      preset: "day",
      timeOfDay: true,
      horizonColor: "#eadcc4",
      sunIntensity: 2.05,
      ambientIntensity: 0.34,
      sunColor: "#fff0cf",
      fogColor: "#b9cfd8",
    });
  });

  test("authored sky fields win over the lighting config", () => {
    const authored = { ...sky, sunIntensity: 1.1, sunColor: "#ffffff", fogColor: "#112233" };
    const noon = skyNoonKeyframes(authored, lighting, "#b9cfd8");
    expect(noon.sunIntensity).toBe(1.1);
    expect(noon.sunColor).toBe("#ffffff");
    expect(noon.fogColor).toBe("#112233");
    expect(noon.ambientIntensity).toBe(0.34);
  });

  test("leaves fields unset when neither source has them", () => {
    const noon = skyNoonKeyframes(sky, undefined, undefined);
    expect(noon.sunIntensity).toBeUndefined();
    expect(noon.ambientIntensity).toBeUndefined();
    expect(noon.fogColor).toBeUndefined();
  });
});
