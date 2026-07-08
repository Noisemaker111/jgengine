import { describe, expect, test } from "bun:test";
import { defineGame } from "@jgengine/core/game/defineGame";
import { offline } from "@jgengine/core/runtime/adapter";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

// Build the definition from core (not the shell wrapper) so this test stays
// browserless — it exercises the real loop/commands against a real GameContext.
import { physics, world } from "../world";
import { onInit, onNewPlayer, onTick, roundSnapshot } from "../loop";
import { assets } from "./assets";
import { content } from "./content";
import { keybinds } from "./keybinds";
import { colOf, createBoard, idx, makeRng, rowOf } from "./board";
import { BOARD_N, TABLE_TOP } from "./tuning";

const CENTER = Math.round((BOARD_N - 1) / 2);
const CENTER_INDEX = idx(BOARD_N, CENTER, CENTER);
const USER = "tester";

function build(): GameContext {
  const definition = defineGame({
    name: "Mine Drop Test",
    world,
    physics,
    input: keybinds,
    assets,
    multiplayer: offline(),
  });
  const ctx = createGameContext({ definition, content, player: { userId: USER, isNew: true } });
  onInit(ctx);
  onNewPlayer(ctx);
  return ctx;
}

function advance(ctx: GameContext, totalSeconds: number, step = 0.05): void {
  let elapsed = 0;
  while (elapsed < totalSeconds) {
    ctx.time.advance(step);
    onTick(ctx, step);
    elapsed += step;
  }
}

function advanceUntilPhase(ctx: GameContext, phase: string, maxSeconds = 5): void {
  let elapsed = 0;
  while (elapsed < maxSeconds && roundSnapshot().phase !== phase) {
    ctx.time.advance(0.05);
    onTick(ctx, 0.05);
    elapsed += 0.05;
  }
}

describe("mine-drop loop integration", () => {
  test("boots into a ready round with a full covered board", () => {
    const ctx = build();
    const snap = roundSnapshot();
    expect(snap.phase).toBe("ready");
    expect(snap.revealed).toBe(0);
    expect(snap.bombs).toBe(8);
    // The player spawned on the board.
    const player = ctx.scene.entity.get(USER);
    expect(player).not.toBeNull();
    expect(player?.position[1]).toBeCloseTo(TABLE_TOP, 5);
    // Board tiles are placed as scene objects.
    expect(ctx.scene.object.list().length).toBeGreaterThan(BOARD_N * BOARD_N);
  });

  test("leaping on the safe centre reveals cells and returns to play", () => {
    const ctx = build();
    expect(roundSnapshot().phase).toBe("ready");

    ctx.game.commands.run("leap", {});
    expect(roundSnapshot().phase).toBe("countdown");

    advanceUntilPhase(ctx, "falling");
    expect(roundSnapshot().phase).toBe("falling");
    // The dug tile was removed — a trapdoor opened.
    expect(ctx.scene.object.get(`cell:${CENTER},${CENTER}`)).toBeNull();

    // No shell integrates gravity here, so resolution falls back to the timeout.
    advance(ctx, 5);
    const snap = roundSnapshot();
    expect(snap.revealed).toBeGreaterThan(0);
    expect(["ready", "win"]).toContain(snap.phase);
    // The dug cell is a revealed tile again (walkable).
    expect(ctx.scene.object.get(`cell:${CENTER},${CENTER}`)).not.toBeNull();
  });

  test("leaping onto a bomb detonates the board", () => {
    const ctx = build();
    const seed = roundSnapshot().seed;
    const board = createBoard(BOARD_N, 8, makeRng(seed), CENTER_INDEX);
    const bombIndex = board.bomb.findIndex(Boolean);
    expect(bombIndex).toBeGreaterThanOrEqual(0);

    // Stand the player on a known bomb cell, then call the leap.
    ctx.scene.entity.setPose(USER, {
      position: [colOf(BOARD_N, bombIndex), TABLE_TOP, rowOf(BOARD_N, bombIndex)],
      rotationY: 0,
    });
    ctx.game.commands.run("leap", {});
    advanceUntilPhase(ctx, "falling");
    advance(ctx, 5);

    expect(roundSnapshot().phase).toBe("boom");
    // Bomb markers were revealed.
    const bombMarks = ctx.scene.entity.list().filter((e) => e.id.startsWith("bomb:"));
    expect(bombMarks.length).toBe(8);

    // Restarting brings back a fresh covered board.
    ctx.game.commands.run("restart", {});
    const after = roundSnapshot();
    expect(after.phase).toBe("ready");
    expect(after.revealed).toBe(0);
  });

  test("flagging toggles a marker without revealing", () => {
    const ctx = build();
    // Move off-centre to an unrevealed neighbour and flag it.
    ctx.scene.entity.setPose(USER, { position: [CENTER + 1, TABLE_TOP, CENTER], rotationY: 0 });
    ctx.game.commands.run("flag", {});
    expect(roundSnapshot().flags).toBe(1);
    const mark = ctx.scene.entity.get(`flag:${CENTER + 1},${CENTER}`);
    expect(mark).not.toBeNull();
    ctx.game.commands.run("flag", {});
    expect(roundSnapshot().flags).toBe(0);
  });
});
