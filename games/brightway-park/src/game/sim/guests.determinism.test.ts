import { beforeEach, describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { game } from "../../game.config";
import { content } from "../content";
import { clearAgents } from "../agents";
import { resetSession, session } from "../session";
import { seedGuests } from "./guests";

const USER = "user_a";

function contextWithSeed(seed: string): GameContext {
  return createGameContext({ definition: game.game, content, player: { userId: USER, isNew: true }, seed });
}

/** The generated fields - ids are a session counter, not randomness. */
function shape() {
  return [...session.guests.values()].map((guest) => ({
    courage: Math.round(guest.courage * 1000),
    litterTimer: Math.round(guest.litterTimer * 1000),
    needs: Object.fromEntries(
      Object.entries(guest.agent.needs.values).map(([need, value]) => [need, Math.round(value * 1000)]),
    ),
  }));
}

function seedInto(seed: string) {
  resetSession();
  clearAgents();
  seedGuests(contextWithSeed(seed), 8);
  return shape();
}

describe("guest generation is reproducible (#1581)", () => {
  beforeEach(() => {
    resetSession();
    clearAgents();
  });

  test("the same world seed generates the same guests", () => {
    expect(seedInto("park-seed-1")).toEqual(seedInto("park-seed-1"));
  });

  test("a different world seed generates different guests", () => {
    expect(seedInto("park-seed-1")).not.toEqual(seedInto("park-seed-2"));
  });

  test("generated needs stay inside their authored ranges", () => {
    for (const guest of seedInto("park-seed-3")) {
      // A seeded crowd is teens, couples and families: nerve between the family's floor and the couple's ceiling.
      expect(guest.courage).toBeGreaterThanOrEqual(20_000);
      expect(guest.courage).toBeLessThanOrEqual(50_000);
      for (const [need, value] of Object.entries(guest.needs)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100_000);
        expect(need).not.toBe("");
      }
    }
  });
});
