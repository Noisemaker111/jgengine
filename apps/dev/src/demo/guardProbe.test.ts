import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { advanceBehaviors, behaviorControl } from "@jgengine/core/scene/behaviorRuntime";

import { createGuardSenses, GUARD_ACTIONS, GUARD_ID, GUARD_POSTS, guardBlackboard, guardGraph, PLAYER_SPAWN, registerGuardActions, WALL, wallBlocks } from "./guardProbe";

const DT = 0.05;

function setup() {
  const definition = defineGameDefinition({ name: "Guard probe", multiplayer: "off" });
  const ctx = createGameContext({ definition, content: {}, player: { userId: "p1", isNew: true } });
  ctx.scene.entity.spawn("hero", { id: "p1", position: PLAYER_SPAWN, role: "player", movement: { walkSpeed: 3 } });
  const [x, z] = GUARD_POSTS[0]!;
  ctx.scene.entity.spawn("guard", {
    id: GUARD_ID,
    position: [x, 0, z],
    role: "npc",
    behaviors: [{ kind: "decisionGraph", actions: GUARD_ACTIONS, graph: guardGraph, blackboard: guardBlackboard }],
  });
  const senses = createGuardSenses();
  const step = (playerX: number, playerZ: number) => {
    ctx.scene.entity.setPose("p1", { position: [playerX, 0, playerZ], dt: DT });
    senses.tick(ctx, "p1", DT);
    advanceBehaviors(ctx, DT);
  };
  return { ctx, senses, step };
}

describe("guard probe", () => {
  test("the wall blocks sight between the yard halves", () => {
    expect(wallBlocks([0, 0, -4], [0, 0, 8])).toBe(true);
    expect(wallBlocks([-9, 0, -4], [-9, 0, 8])).toBe(false);
  });

  test("hears a sprint, investigates around the wall, loses the player, and returns to patrol", () => {
    const unregister = registerGuardActions();
    const { ctx, step } = setup();
    const board = () => behaviorControl(ctx).blackboard(GUARD_ID)!;
    const guard = () => ctx.scene.entity.get(GUARD_ID)!.position;
    const inWall = () => guard()[0] > WALL.minX && guard()[0] < WALL.maxX && guard()[2] > WALL.minZ && guard()[2] < WALL.maxZ;

    for (let i = 0; i < 40; i += 1) step(PLAYER_SPAWN[0], PLAYER_SPAWN[2]);
    expect(board().alerted).toBe(false);

    let px = 0;
    for (let i = 0; i < 12; i += 1) step((px += 6 * DT), -1);
    expect(board().alerted).toBe(true);
    const lastKnown: [number, number] = [Number(board().lastKnownX), Number(board().lastKnownZ)];

    let reached = false;
    let pz = -1;
    for (let i = 0; i < 400 && !reached; i += 1) {
      step(px, (pz = Math.max(-19, pz - 2.5 * DT)));
      expect(inWall()).toBe(false);
      reached = Math.hypot(guard()[0] - lastKnown[0], guard()[2] - lastKnown[1]) < 0.5;
    }
    expect(reached).toBe(true);

    for (let i = 0; i < 200 && board().alerted === true; i += 1) step(px, -19);
    expect(board().alerted).toBe(false);
    const afterGiveUp = guard();
    for (let i = 0; i < 60; i += 1) step(px, -19);
    const post = GUARD_POSTS[Number(board().post) % GUARD_POSTS.length]!;
    expect(Math.hypot(guard()[0] - post[0], guard()[2] - post[1])).toBeLessThan(Math.hypot(afterGiveUp[0] - post[0], afterGiveUp[2] - post[1]));
    unregister();
  });
});
