import { describe, expect, test } from "bun:test";
import { defineGame } from "@jgengine/core/game/defineGame";
import { offline } from "@jgengine/core/runtime/adapter";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { physics, world } from "../world";
import { onInit, onNewPlayer, onTick, roundSnapshot } from "../loop";
import { assets } from "./assets";
import { content } from "./content";
import { keybinds } from "./keybinds";
import { colOf, createBoard, idx, makeRng, rowOf } from "./board";
import { BOARD_N, BOMB_COUNT, CELL_PITCH, TABLE_TOP, cellWorld } from "./tuning";

const CENTER = Math.round((BOARD_N - 1) / 2);
const CENTER_INDEX = idx(BOARD_N, CENTER, CENTER);
const [CENTER_X, CENTER_Z] = cellWorld(CENTER, CENTER);
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

function pressJump(ctx: GameContext): void {
  ctx.input.publish(["jump"]);
  onTick(ctx, 0.05);
  ctx.input.publish([]);
}

describe("mine-drop loop integration", () => {
  test("boots into a ready round with a full covered board", () => {
    const ctx = build();
    const snap = roundSnapshot();
    expect(snap.phase).toBe("ready");
    expect(snap.revealed).toBe(0);
    expect(snap.bombs).toBe(BOMB_COUNT);
    const player = ctx.scene.entity.get(USER);
    expect(player).not.toBeNull();
    expect(player?.position[1]).toBeCloseTo(TABLE_TOP, 5);
    expect(ctx.scene.object.list().length).toBeGreaterThan(BOARD_N * BOARD_N);
  });

  test("jumping on the safe centre reveals cells and returns to play", () => {
    const ctx = build();
    expect(roundSnapshot().phase).toBe("ready");

    pressJump(ctx);
    expect(roundSnapshot().phase).toBe("falling");
    expect(ctx.scene.object.get(`cell:${CENTER},${CENTER}`)).toBeNull();

    advance(ctx, 5);
    const snap = roundSnapshot();
    expect(snap.revealed).toBeGreaterThan(0);
    expect(["ready", "win"]).toContain(snap.phase);
    expect(ctx.scene.object.get(`cell:${CENTER},${CENTER}`)).not.toBeNull();
  });

  test("jumping onto a bomb detonates the board", () => {
    const ctx = build();
    const seed = roundSnapshot().seed;
    const board = createBoard(BOARD_N, BOMB_COUNT, makeRng(seed), CENTER_INDEX);
    const bombIndex = board.bomb.findIndex(Boolean);
    expect(bombIndex).toBeGreaterThanOrEqual(0);

    const col = colOf(BOARD_N, bombIndex);
    const row = rowOf(BOARD_N, bombIndex);
    const [x, z] = cellWorld(col, row);
    ctx.scene.entity.setPose(USER, {
      position: [x, TABLE_TOP, z],
      rotationY: 0,
    });
    pressJump(ctx);
    advanceUntilPhase(ctx, "falling");
    advance(ctx, 5);

    expect(roundSnapshot().phase).toBe("boom");
    const bombMarks = ctx.scene.entity.list().filter((e) => e.id.startsWith("bomb:"));
    expect(bombMarks.length).toBe(BOMB_COUNT);

    ctx.game.commands.run("restart", {});
    const after = roundSnapshot();
    expect(after.phase).toBe("ready");
    expect(after.revealed).toBe(0);
  });

  test("flagging toggles a marker without revealing", () => {
    const ctx = build();
    const [x, z] = cellWorld(CENTER + 1, CENTER);
    ctx.scene.entity.setPose(USER, { position: [x, TABLE_TOP, z], rotationY: 0 });
    ctx.game.commands.run("flag", {});
    expect(roundSnapshot().flags).toBe(1);
    const mark = ctx.scene.entity.get(`flag:${CENTER + 1},${CENTER}`);
    expect(mark).not.toBeNull();
    ctx.game.commands.run("flag", {});
    expect(roundSnapshot().flags).toBe(0);
  });

  test("jumping in a crack does not dig", () => {
    const ctx = build();
    ctx.scene.entity.setPose(USER, {
      position: [CENTER_X + CELL_PITCH / 2, TABLE_TOP, CENTER_Z],
      rotationY: 0,
    });
    pressJump(ctx);
    expect(roundSnapshot().phase).toBe("ready");
    expect(roundSnapshot().revealed).toBe(0);
  });
});
