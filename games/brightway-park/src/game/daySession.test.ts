import { describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";

import { game } from "../game.config";
import { content } from "./content";
import { closeParkDay, dayLoop, openParkDay } from "./daySession";
import { park } from "./park";

function boot() {
  return createGameContext({ definition: game.game, content, player: { userId: "park-session", isNew: true } });
}

/**
 * A park day is the shared session loop's session. It carries nothing - a tycoon day banks its
 * takings as they happen - and it still opens and closes with the day number.
 */
describe("Brightway Park day session", () => {
  test("the day opens with the gates, carries nothing, and midnight closes it", () => {
    const ctx = boot();
    const loop = dayLoop(ctx);
    expect(loop.kind()).toBe("day");
    expect(loop.phase()).toBe("idle");

    openParkDay(ctx);
    expect(loop.phase()).toBe("open");
    expect(loop.snapshot()).toMatchObject({ session: 1, closed: 0, carried: 0 });
    // A day that carries nothing still opens: the loop is the session, not the money.
    expect(loop.carry(50)).toBe(0);

    closeParkDay(ctx);
    expect(park.of(ctx).num("park.day")).toBe(2);
    expect(loop.snapshot()).toMatchObject({ session: 2, closed: 1, carried: 0 });
    expect(loop.phase()).toBe("open");
  });

  test("the probe reports the park day as a session with no carried quantity", () => {
    const ctx = boot();
    openParkDay(ctx);
    const probe = (globalThis as { __jgengineRun?: { read(): { kind: string | null; phase: string; carried: number } } }).__jgengineRun;
    expect(probe?.read()).toMatchObject({ kind: "day", phase: "open", carried: 0 });
  });
});
