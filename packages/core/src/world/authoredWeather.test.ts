import { describe, expect, test } from "bun:test";
import { createAuthoredWeather, createWeatherExposure, createWeatherEnvironmentField, validateAuthoredWeather } from "./authoredWeather";

const config = {
  initialProfileId: "dry",
  profiles: [
    { id: "dry", mode: "clear" as const, intensity: 0, temperatureOffset: 10 },
    { id: "rain", mode: "rain" as const, intensity: 1, temperatureOffset: -4 },
    { id: "snow", mode: "snow" as const, intensity: 1, temperatureOffset: -10 },
  ],
  schedule: [
    { atSeconds: 10, profileId: "rain", transitionSeconds: 4 },
    { atSeconds: 13, profileId: "snow", transitionSeconds: 4 },
  ],
  wind: { direction: [1, 0] as const, speed: 2, gust: 1, turbulence: 0.5, seed: "fixture" },
};

describe("authored weather", () => {
  test("absolute clock replay and overlapping transitions remain continuous", () => {
    const weather = createAuthoredWeather(config);
    expect(weather.sample(0, 0, 0).mode).toBe("clear");
    expect(weather.sample(0, 0, 12).rain).toBe(0.5);
    expect(weather.sample(0, 0, 13).rain).toBe(0.75);
    const mixed = weather.sample(0, 0, 15);
    expect(mixed.rain).toBe(0.375);
    expect(mixed.snow).toBe(0.5);
    expect(mixed.mode).toBe("mixed");
    expect(weather.sample(0, 0, 17).mode).toBe("snow");
    const saved = weather.sample(12, -8, 12);
    weather.sample(12, -8, 1000);
    expect(weather.sample(12, -8, 12)).toEqual(saved);
    expect(createAuthoredWeather(config).sample(12, -8, 12)).toEqual(saved);
  });

  test("authored data is detached from callers and local radial wind adds with smooth falloff", () => {
    const authored = {
      ambient: { mode: "rain" as const, intensity: 1 },
      wind: { direction: [1, 0] as const, speed: 2 },
      zones: [{ id: "sheltered-courtyard", center: [0, 0] as const, radius: 2, falloff: 2, weather: { mode: "clear" as const, intensity: 0 }, wind: { speed: 4 }, radial: true }],
    };
    const weather = createAuthoredWeather(authored);
    authored.wind.speed = 99;
    expect(weather.sample(0, 0, 0).wind).toEqual([2, 0]);
    expect(weather.sample(0, 1, 0).wind).toEqual([2, 4]);
    expect(weather.sample(0, 3, 0).wind).toEqual([2, 2]);
    expect(weather.sample(0, 3, 0).rain).toBe(0.5);
    expect(weather.sample(0, 5, 0).rain).toBe(1);
  });

  test("rejects missing references, duplicate ids, invalid times and unbounded author lists", () => {
    expect(() => validateAuthoredWeather({ initialProfileId: "missing" })).toThrow("unknown initial");
    expect(() => validateAuthoredWeather({ schedule: [{ atSeconds: 1, profileId: "missing" }] })).toThrow("unknown weather profile");
    expect(() => validateAuthoredWeather({ ...config, schedule: [{ atSeconds: 1, profileId: "rain" }, { atSeconds: 1, profileId: "snow" }] })).toThrow("strictly increasing");
    expect(() => validateAuthoredWeather({ ambient: { mode: "rain", intensity: NaN } })).toThrow();
    expect(() => validateAuthoredWeather({ zones: [{ id: "bad", center: [0, 0], radius: Infinity }] })).toThrow();
    expect(() => validateAuthoredWeather({ profiles: Array.from({ length: 257 }, (_, i) => ({ id: String(i), mode: "clear", intensity: 0 })) })).toThrow("limited");
  });
});

describe("weather surface exposure", () => {
  test("seeded fixed steps preserve accumulation through pause, snapshot and restore", () => {
    const weather = createAuthoredWeather(config);
    const exposure = createWeatherExposure();
    const surfaces = [{ id: "outside", x: 1, z: 2 }, { id: "roof", x: 1, z: 2, exposure: 0 }];
    for (let i = 0; i < 30; i += 1) exposure.step(0.1, 14 + i * 0.1, surfaces, weather);
    expect(exposure.sample("outside")!.wetness).toBeGreaterThan(0);
    expect(exposure.sample("outside")!.snow).toBeGreaterThan(0);
    expect(exposure.sample("roof")!.wetness).toBe(0);
    expect(exposure.sample("roof")!.snow).toBe(0);
    const saved = exposure.snapshot();
    exposure.step(0, 100, surfaces, weather);
    expect(exposure.snapshot()).toEqual(saved);
    const replay = createWeatherExposure();
    replay.restore(saved);
    for (let i = 0; i < 20; i += 1) {
      exposure.step(0.1, 18 + i * 0.1, surfaces, weather);
      replay.step(0.1, 18 + i * 0.1, surfaces, weather);
    }
    expect(exposure.snapshot()).toEqual(replay.snapshot());
  });

  test("retunes drying/melting, protects retained capacity and restores injected storage", () => {
    const weather = createAuthoredWeather({ ambient: { mode: "snow", intensity: 1 } });
    let saved: ReturnType<ReturnType<typeof createWeatherExposure>["snapshot"]> | undefined;
    const storage = { read: () => saved, write: (value: NonNullable<typeof saved>) => { saved = value; } };
    const exposure = createWeatherExposure({ maxSurfaces: 2, snowRate: 1 }, storage);
    exposure.step(1, 0, [{ id: "a", x: 0, z: 0 }, { id: "b", x: 0, z: 0 }], weather);
    expect(createWeatherExposure({}, storage).sample("a")!.snow).toBe(1);
    expect(() => exposure.retune({ maxSurfaces: 1 })).toThrow("retained");
    expect(() => exposure.step(1, 1, [{ id: "c", x: 0, z: 0 }], weather)).toThrow("capacity");
    exposure.forget("b");
    exposure.retune({ maxSurfaces: 1, snowRate: 0, meltRate: 0.5, dryingRate: 0 });
    exposure.step(1, 1, [{ id: "a", x: 0, z: 0, temperature: 1 }], weather);
    expect(exposure.sample("a")!.snow).toBe(0.5);
    expect(exposure.sample("a")!.wetness).toBe(0.5);
    const snapshot = exposure.snapshot();
    snapshot.surfaces[0]!.value.snow = 0;
    expect(exposure.sample("a")!.snow).toBe(0.5);
    expect(() => exposure.restore({ surfaces: [{ id: "a", value: { wetness: 2, snow: 0, heat: 0, exposure: 1 } }] })).toThrow();
    expect(exposure.sample("a")!.snow).toBe(0.5);
  });
});

test("weather environment field shares scheduled rain, shelter and temperature offset", () => {
  const weather = createAuthoredWeather({ ambient: { mode: "rain", intensity: 1, temperatureOffset: -10 } });
  const field = createWeatherEnvironmentField(weather, { baseTemperature: 20, nightDrop: 0, dayLength: 100, occluders: [{ x: 0, z: 0, w: 4, d: 4 }] });
  expect(field.wetness(10, 0, 50)).toBe(1);
  expect(field.wetness(0, 0, 50)).toBe(0);
  expect(field.temperature(10, 0, 50)).toBe(6);
  expect(field.sample(0, 0, 50).temperature).toBe(10);
  expect(field.sample(0, 0, 50).sheltered).toBe(true);
});

test("warm snowfall melts incoming snow into persistent wetness", () => {
  const weather = createAuthoredWeather({ ambient: { mode: "snow", intensity: 1 } });
  const exposure = createWeatherExposure({ snowRate: 0.1, meltRate: 1, dryingRate: 0 });
  exposure.step(1, 0, [{ id: "warm", x: 0, z: 0, temperature: 5 }], weather);
  expect(exposure.sample("warm")!.snow).toBe(0);
  expect(exposure.sample("warm")!.wetness).toBeCloseTo(0.1);
});

test("finite extreme authored wind is rejected before document state or history changes", async () => {
  const { createEditorSession } = await import("../editor/commands");
  const { createEmptyEditorDocument, decodeEditorDocument } = await import("../editor/document");
  const session = createEditorSession(createEmptyEditorDocument());
  const invalid = { wind: { direction: [1, 0] as const, speed: 1e308 }, zones: [{ id: "overflow", center: [0, 0] as const, radius: 2, wind: { direction: [1, 0] as const, speed: 1e308 } }] };
  const before = session.getState().document;
  expect(() => createAuthoredWeather(invalid)).toThrow("wind.speed");
  const result = session.transaction([{ type: "setSimulation", simulation: { weather: invalid } }]);
  expect(result.ok).toBe(false);
  expect(session.getState().document).toBe(before);
  expect(session.canUndo()).toBe(false);
  const decoded = decodeEditorDocument({ ...createEmptyEditorDocument(), simulation: { weather: invalid } });
  expect(decoded.ok).toBe(false);
  if (!decoded.ok) expect(JSON.stringify(decoded.errors)).toContain("$.simulation.weather");
  for (const key of ["gust", "turbulence", "gustFrequency"] as const) expect(() => createAuthoredWeather({ wind: { [key]: 1e308 } })).toThrow();
  expect(() => createAuthoredWeather({ wind: { direction: [1e308, 1e308] } })).toThrow();
  expect(() => createAuthoredWeather({ ambient: { mode: "clear", intensity: 0, temperatureOffset: 1e308 } })).toThrow();
  expect(() => createAuthoredWeather({ zones: [{ id: "huge", center: [0, 0], radius: 1e308, falloff: 1e308 }] })).toThrow();
});

test("maximal supported wind, zones and query domains produce finite samples", () => {
  const weather = createAuthoredWeather({
    wind: { direction: [1e6, 1e6], speed: 1e6, gust: 1e6, turbulence: 1e6, gustFrequency: 1000, seed: "large-finite" },
    zones: Array.from({ length: 256 }, (_, i) => ({ id: String(i), center: [0, 0] as const, radius: 1e12, falloff: 1e12, wind: { direction: [1e6, 1e6] as const, speed: 1e6, gust: 1e6, turbulence: 1e6, gustFrequency: 1000, seed: i } })),
  });
  for (const [x, z, time] of [[0, 0, 0], [1e12, -1e12, 1e12], [-1e12, 1e12, 1e12 - 1]]) {
    const sample = weather.sample(x!, z!, time!);
    expect(sample.wind.every(Number.isFinite)).toBe(true);
    expect(Object.values(sample).filter((value) => typeof value === "number").every(Number.isFinite)).toBe(true);
  }
  expect(() => weather.sample(1e308, 0, 0)).toThrow("weather sample x");
  expect(() => weather.sample(0, 0, 1e308)).toThrow("weather sample time");
});
