import { describe, expect, test } from "bun:test";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { captureCommand } from "@jgengine/core/game/captureCommand";
import { createHeadlessRunner, type HeadlessPlayable, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

/**
 * Every game, the same check: a game played in one context leaves nothing behind for the next. A fresh
 * context opened after a play-through must equal one opened before it, and playing the same seconds
 * again must reach the same state. Module-level state, a shared store initial or a listener that
 * outlives its game shows up here without anyone naming it.
 */
const gamesDir = join(import.meta.dir, "..");
const games = readdirSync(gamesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(gamesDir, entry.name, "src", "game.config.ts")))
  .map((entry) => entry.name)
  .sort();

const PLAY_SECONDS = 20;

/** A fresh context, started the way its title screen's start button starts it (`capture.play`). */
function open(game: HeadlessPlayable): HeadlessRunner {
  let now = 1_700_000_000_000;
  const runner = createHeadlessRunner({ game, now: () => (now += 16), seed: "context-isolation" });
  for (const entry of game.capture?.play ?? []) {
    const { name, input } = captureCommand(entry);
    const result = runner.ctx.game.commands.run(name, input);
    if (result.status === "rejected") throw new Error(`start command ${name} was rejected: ${result.reason}`);
  }
  return runner;
}

/** The world as JSON, so two contexts compare by value and functions held at runtime drop out. */
function stateOf(runner: HeadlessRunner): unknown {
  return JSON.parse(JSON.stringify(runner.snapshot()));
}

describe("a game leaves nothing behind for the next context", () => {
  test("every game is checked", () => {
    expect(games.length).toBe(10);
  });

  for (const name of games) {
    test(name, async () => {
      const { game } = (await import(join(gamesDir, name, "src", "game.config.ts"))) as { game: HeadlessPlayable };
      // A game with a run lifecycle says how its start button starts it; one without (always-live) runs from boot.
      expect(game.capture?.play !== undefined || game.game.lifecycle === undefined, `${name} declares no capture.play`).toBe(true);
      const before = stateOf(open(game));

      const first = open(game);
      first.step(PLAY_SECONDS);
      const played = stateOf(first);

      const after = open(game);
      expect(stateOf(after), `${name}: a fresh context after a play-through differs from one before it`).toEqual(before);
      after.step(PLAY_SECONDS);
      expect(stateOf(after), `${name}: the same seconds played again reach a different state`).toEqual(played);
    }, 120_000);
  }
});
