import { describe, expect, test } from "bun:test";
import { MISSION_HINTS, QUESTS } from "./catalog";

describe("vice-isle mission chain", () => {
  test("eight missions chain end to end", () => {
    expect(QUESTS.length).toBe(8);
    for (let i = 1; i < QUESTS.length; i += 1) {
      expect(QUESTS[i]?.requires).toEqual([QUESTS[i - 1]?.id ?? ""]);
      expect(QUESTS[i - 1]?.rewards.quests).toEqual([QUESTS[i]?.id ?? ""]);
    }
    expect(QUESTS[QUESTS.length - 1]?.rewards.quests).toBeUndefined();
  });

  test("every mission has a hint and a cash reward", () => {
    for (const quest of QUESTS) {
      expect(MISSION_HINTS[quest.id]).toBeTruthy();
      expect(quest.rewards.economy?.cash ?? 0).toBeGreaterThan(0);
    }
  });
});
