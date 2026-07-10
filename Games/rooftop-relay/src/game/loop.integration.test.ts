import { describe, expect, test } from "bun:test";
import { defineGame } from "@jgengine/core/game/defineGame";
import { offline } from "@jgengine/core/runtime/adapter";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { content } from "./content";
import { keybinds } from "./keybinds";
import { RUNNERS } from "./runners/catalog";
import { ROUTE } from "./route/legs";
import { FALL_HEIGHT_THRESHOLD } from "./tuning";
import { getSession, onInit, onNewPlayer, onTick } from "../loop";
import { physics, world } from "../world";

const USER = "tester";

function build(): GameContext {
  const definition = defineGame({ name: "Rooftop Relay Test", world, physics, input: keybinds, multiplayer: offline() });
  const ctx = createGameContext({ definition, content, player: { userId: USER, isNew: true } });
  onInit(ctx);
  onNewPlayer(ctx);
  return ctx;
}

function step(ctx: GameContext, dt = 0.1): void {
  ctx.time.advance(dt);
  onTick(ctx, dt);
}

function teleportActiveTo(ctx: GameContext, position: readonly [number, number, number]): void {
  const activeId = ctx.player.possession.active(ctx.player.userId);
  ctx.scene.entity.setPose(activeId, { position });
}

describe("rooftop-relay loop integration", () => {
  test("boots with runner 1 possessed and parked crew waiting at their legs", () => {
    const ctx = build();
    expect(ctx.player.possession.active(USER)).toBe(USER);
    const local = ctx.scene.entity.get(USER);
    expect(local?.role).toBe("player");
    for (const runner of RUNNERS.slice(1)) {
      const entity = ctx.scene.entity.get(runner.id);
      expect(entity).not.toBeNull();
      expect(entity?.role).toBe("npc");
    }
    expect(getSession(ctx).relay.phase).toBe("menu");
  });

  test("start begins the relay and the world has a real rooftop lattice", () => {
    const ctx = build();
    ctx.game.commands.run("start", {});
    expect(getSession(ctx).relay.phase).toBe("running");
    expect(ctx.scene.object.list().length).toBeGreaterThan(500);
  });

  test("sprinting into the leg 1 handoff zone hands control to runner 2", () => {
    const ctx = build();
    ctx.game.commands.run("start", {});
    step(ctx, 0.05);
    const handoff = ROUTE.legs[0]!.handoffCheckpoint.position;
    teleportActiveTo(ctx, handoff);
    step(ctx, 0.1);

    const session = getSession(ctx);
    expect(session.relay.legIndex).toBe(1);
    expect(session.relay.splits.length).toBe(1);
    expect(ctx.player.possession.active(USER)).toBe(RUNNERS[1]!.id);
    expect(ctx.scene.entity.get(USER)?.role).toBe("npc");
    expect(ctx.scene.entity.get(RUNNERS[1]!.id)?.role).toBe("player");
  });

  test("a fumbled walk-in handoff still advances the leg but costs time", () => {
    const ctx = build();
    ctx.game.commands.run("start", {});
    step(ctx, 0.05);
    const handoff = ROUTE.legs[0]!.handoffCheckpoint.position;
    teleportActiveTo(ctx, handoff);
    step(ctx, 0.001);
    const session = getSession(ctx);
    expect(session.relay.splits[0]!.quality).not.toBe(undefined);
  });

  test("falling below the rooftop threshold resets to the leg's start checkpoint and costs 5s", () => {
    const ctx = build();
    ctx.game.commands.run("start", {});
    const before = getSession(ctx).relay.fallCount;
    teleportActiveTo(ctx, [0, FALL_HEIGHT_THRESHOLD - 1, 5]);
    step(ctx, 0.05);
    const session = getSession(ctx);
    expect(session.relay.fallCount).toBe(before + 1);
    const local = ctx.scene.entity.get(USER)!;
    expect(local.position[1]).toBeGreaterThanOrEqual(FALL_HEIGHT_THRESHOLD);
  });

  test("clearing all five legs wins the relay with a full splits table", () => {
    const ctx = build();
    ctx.game.commands.run("start", {});
    for (const leg of ROUTE.legs) {
      step(ctx, 0.05);
      teleportActiveTo(ctx, leg.handoffCheckpoint.position);
      step(ctx, 0.05);
    }
    const session = getSession(ctx);
    expect(session.relay.phase).toBe("won");
    expect(session.relay.splits.length).toBe(ROUTE.legs.length);
  });

  test("restart mid-run returns full control to runner 1 with a clean slate", () => {
    const ctx = build();
    ctx.game.commands.run("start", {});
    step(ctx, 0.05);
    teleportActiveTo(ctx, ROUTE.legs[0]!.handoffCheckpoint.position);
    step(ctx, 0.05);
    expect(getSession(ctx).relay.legIndex).toBe(1);

    ctx.game.commands.run("restart", {});
    const session = getSession(ctx);
    expect(session.relay.phase).toBe("running");
    expect(session.relay.legIndex).toBe(0);
    expect(session.relay.splits).toEqual([]);
    expect(ctx.player.possession.active(USER)).toBe(USER);
    expect(ctx.scene.entity.get(USER)?.role).toBe("player");
    expect(ctx.scene.entity.get(RUNNERS[1]!.id)?.role).toBe("npc");
  });
});
