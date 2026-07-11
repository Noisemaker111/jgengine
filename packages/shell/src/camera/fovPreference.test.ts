import { describe, expect, test } from "bun:test";

import {
  PLAYER_FOV_DEFAULT,
  PLAYER_FOV_MAX,
  PLAYER_FOV_MIN,
  clampPlayerFov,
  composePlayerFov,
  loadPlayerFov,
  resolvePlayerFovBounds,
  savePlayerFov,
} from "./fovPreference";

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    key() {
      return null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe("clampPlayerFov", () => {
  test("clamps to safe bounds", () => {
    expect(clampPlayerFov(10)).toBe(PLAYER_FOV_MIN);
    expect(clampPlayerFov(200)).toBe(PLAYER_FOV_MAX);
    expect(clampPlayerFov(72)).toBe(72);
  });

  test("rejects non-finite values with the default", () => {
    expect(clampPlayerFov(Number.NaN)).toBe(PLAYER_FOV_DEFAULT);
    expect(clampPlayerFov(Number.POSITIVE_INFINITY)).toBe(PLAYER_FOV_DEFAULT);
    expect(clampPlayerFov("55")).toBe(PLAYER_FOV_DEFAULT);
    expect(clampPlayerFov(null)).toBe(PLAYER_FOV_DEFAULT);
  });
});

describe("composePlayerFov", () => {
  test("preference alone is the base when the rig uses the default FOV", () => {
    expect(composePlayerFov(70, PLAYER_FOV_DEFAULT)).toBe(70);
  });

  test("chase-speed / ADS modulation stacks as a delta from the default", () => {
    expect(composePlayerFov(70, 78)).toBe(93);
    expect(composePlayerFov(70, 41.25)).toBe(56.25);
  });

  test("cinematic absolute mode ignores preference shift", () => {
    expect(composePlayerFov(90, 35, "absolute")).toBe(PLAYER_FOV_MIN);
    expect(composePlayerFov(90, 48, "absolute")).toBe(48);
  });

  test("clamps composed results", () => {
    expect(composePlayerFov(100, 90)).toBe(PLAYER_FOV_MAX);
  });
});

describe("player FOV persistence", () => {
  test("loads and clamps persisted values", () => {
    const bounds = resolvePlayerFovBounds();
    const storage = memoryStorage({ "jgengine:player-fov": "88" });
    expect(loadPlayerFov(bounds, storage)).toBe(88);
    storage.setItem("jgengine:player-fov", "999");
    expect(loadPlayerFov(bounds, storage)).toBe(PLAYER_FOV_MAX);
    storage.setItem("jgengine:player-fov", "nope");
    expect(loadPlayerFov(bounds, storage)).toBe(PLAYER_FOV_DEFAULT);
  });

  test("saves a clamped value and restores it", () => {
    const bounds = resolvePlayerFovBounds({ min: 50, max: 80, default: 60 });
    const storage = memoryStorage();
    expect(savePlayerFov(95, bounds, storage)).toBe(80);
    expect(loadPlayerFov(bounds, storage)).toBe(80);
  });

  test("missing storage falls back to default", () => {
    expect(loadPlayerFov(resolvePlayerFovBounds({ default: 62 }), null)).toBe(62);
  });
});
