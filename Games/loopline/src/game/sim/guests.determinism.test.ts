import { beforeEach, describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { game } from "../../game.config";
import { content } from "../content";
import { resetSession, session, type GuestState } from "../session";
import { seedGuests } from "./guests";

const USER = "user_a";

function contextWithSeed(seed: string): GameContext {
  return createGameContext({ definition: game.game, content, player: { userId: USER, isNew: true }, seed });
}

/** The generated fields — ids are a session counter, not randomness. */
function shape(guests: readonly GuestState[]) {
  return guests.map((guest) => ({
    money: guest.money,
    hunger: guest.hunger,
    thirst: guest.thirst,
    souvenir: guest.souvenir,
    litterTimer: guest.litterTimer,
  }));
}

function seedInto(seed: string) {
  resetSession();
  seedGuests(contextWithSeed(seed), 8);
  return shape([...session.guests.values()]);
}

describe("guest generation is reproducible (#1581)", () => {
  beforeEach(resetSession);

  test("the same world seed generates the same guests", () => {
    expect(seedInto("park-seed-1")).toEqual(seedInto("park-seed-1"));
  });

  test("a different world seed generates different guests", () => {
    expect(seedInto("park-seed-1")).not.toEqual(seedInto("park-seed-2"));
  });

  test("generated stats stay inside their authored ranges", () => {
    for (const guest of seedInto("park-seed-3")) {
      expect(guest.money).toBeGreaterThanOrEqual(30);
      expect(guest.money).toBeLessThanOrEqual(80);
      expect(guest.hunger).toBeGreaterThanOrEqual(20);
      expect(guest.hunger).toBeLessThanOrEqual(60);
      expect(guest.souvenir).toBeGreaterThanOrEqual(0);
      expect(guest.souvenir).toBeLessThanOrEqual(0.5);
    }
  });
});
