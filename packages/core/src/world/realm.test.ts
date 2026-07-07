import { describe, expect, test } from "bun:test";

import { composeRealm, DEFAULT_REALM_ENVIRONMENT, type RealmCard } from "./realm";
import { SECONDS_PER_GAME_DAY } from "../time/gameClock";

const forest: RealmCard = {
  id: "forest",
  kind: "major",
  environment: { baseTemperature: 16, rain: 0.4 },
  spawn: { set: { deer: 5, wolf: 2, oak: 8 } },
  aesthetic: "temperate",
};

const blizzard: RealmCard = {
  id: "blizzard",
  kind: "minor",
  environment: { baseTemperature: -8, nightDrop: 20 },
  weather: { kind: "snow", intensity: 0.9 },
  spawn: { scale: { deer: 0.2 }, add: { wolf: 3 }, remove: ["oak"] },
  aesthetic: "frost",
};

const longNight: RealmCard = {
  id: "longNight",
  kind: "minor",
  environment: { dayLength: SECONDS_PER_GAME_DAY * 0.5, ambientFloor: 0.02 },
  spawn: { add: { wraith: 4 } },
};

describe("composeRealm", () => {
  test("major sets the base; empty deck keeps defaults", () => {
    const realm = composeRealm({}, []);
    expect(realm.params).toEqual(DEFAULT_REALM_ENVIRONMENT);
    expect(realm.weather).toEqual({ kind: "clear", intensity: 0 });
    expect(realm.spawnTable).toEqual({});
  });

  test("minors override environment params last-write-wins", () => {
    const realm = composeRealm({}, [forest, blizzard]);
    expect(realm.params.baseTemperature).toBe(-8);
    expect(realm.params.nightDrop).toBe(20);
    expect(realm.params.rain).toBe(0.4);
    expect(realm.weather).toEqual({ kind: "snow", intensity: 0.9 });
  });

  test("spawn edits apply in deck order (set → scale/add/remove)", () => {
    const realm = composeRealm({}, [forest, blizzard, longNight]);
    expect(realm.spawnTable).toEqual({ deer: 1, wolf: 5, wraith: 4 });
  });

  test("aesthetics accumulate across cards", () => {
    const realm = composeRealm({}, [forest, blizzard]);
    expect(realm.aesthetics).toEqual(["temperate", "frost"]);
  });

  test("composed env field reflects recomposed params + weather (depends on #92)", () => {
    const realm = composeRealm({}, [forest, blizzard]);
    const field = realm.environmentField();
    const noon = field.temperature(0, 0, SECONDS_PER_GAME_DAY * 0.5, 0);
    expect(noon).toBeLessThan(0);
    expect(field.wetness(0, 0, 0)).toBeGreaterThan(0);
  });

  test("long-night card shortens the day cycle in the composed field", () => {
    const realm = composeRealm({}, [forest, longNight]);
    const field = realm.environmentField();
    expect(field.sunElevation(SECONDS_PER_GAME_DAY * 0.25)).toBeCloseTo(1, 5);
  });

  test("base realm inputs seed params, weather, and spawn", () => {
    const realm = composeRealm(
      { environment: { baseTemperature: 30 }, weather: { kind: "sandstorm", intensity: 0.5 }, spawn: { scorpion: 3 } },
      [],
    );
    expect(realm.params.baseTemperature).toBe(30);
    expect(realm.weather.kind).toBe("sandstorm");
    expect(realm.spawnTable).toEqual({ scorpion: 3 });
  });

  test("precipitating weather wets the field; clear weather stays dry", () => {
    const wet = composeRealm({ environment: { rain: 0.8 }, weather: { kind: "rain", intensity: 0.5 } }, []);
    const dry = composeRealm({ environment: { rain: 0.8 }, weather: { kind: "clear", intensity: 0 } }, []);
    expect(wet.environmentField().wetness(0, 0, 0)).toBeCloseTo(0.8, 5);
    expect(dry.environmentField().wetness(0, 0, 0)).toBe(0);
  });
});
