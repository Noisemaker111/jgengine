import { describe, expect, test } from "bun:test";
import { computeGameDay } from "@jgengine/core/time/gameClock";
import { shouldSpawnDailyBills } from "@llmville/game/economy/billing";

describe("daily bill cadence on the Schedule part", () => {
  test("bills exactly when a new game day has started past the last billed one", () => {
    const createdAt = 1_700_000_000_000;
    for (const gameTimeScale of [undefined, null, 1, 24, 60, 1440, 7.3, 0, -2]) {
      for (const lastBilledGameDay of [undefined, -1, 0, 1, 2, 5, 2.5]) {
        for (let minute = 0; minute <= 24 * 60 * 3; minute += 7) {
          for (const offsetMs of [-1, 0, 1, 333]) {
            const now = createdAt + minute * 60_000 + offsetMs;
            const expected = computeGameDay(createdAt, now, gameTimeScale) > Math.max(lastBilledGameDay ?? -1, 0);
            expect(shouldSpawnDailyBills({ now, createdAt, gameTimeScale, lastBilledGameDay })).toBe(expected);
          }
        }
      }
    }
  });

  test("bills on the first millisecond of a new game day", () => {
    const createdAt = 5_000;
    const dayMs = 24 * 60 * 60 * 1000 / 60;
    expect(shouldSpawnDailyBills({ now: createdAt + dayMs - 1, createdAt, gameTimeScale: 60, lastBilledGameDay: undefined })).toBe(false);
    expect(shouldSpawnDailyBills({ now: createdAt + dayMs, createdAt, gameTimeScale: 60, lastBilledGameDay: undefined })).toBe(true);
    expect(shouldSpawnDailyBills({ now: createdAt + 2 * dayMs - 1, createdAt, gameTimeScale: 60, lastBilledGameDay: 1 })).toBe(false);
    expect(shouldSpawnDailyBills({ now: createdAt + 2 * dayMs, createdAt, gameTimeScale: 60, lastBilledGameDay: 1 })).toBe(true);
  });
});
