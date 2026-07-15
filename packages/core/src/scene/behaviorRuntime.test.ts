import { describe, expect, test } from "bun:test";

import { defineGame } from "../game/defineGame";
import { createGameContext } from "../runtime/gameContext";
import { advanceBehaviors } from "./behaviorRuntime";
import { patrol, wander } from "./behaviors";

function ctx() {
  const definition = defineGame({ name: "Behaviors", multiplayer: "off" });
  return createGameContext({ definition, content: {}, player: { userId: "p1", isNew: true } });
}

describe("advanceBehaviors", () => {
  test("advances a patrol entity along its waypoints and poses it", () => {
    const c = ctx();
    c.scene.entity.spawn("car", {
      id: "car1",
      position: [0, 0, 0],
      role: "prop",
      behaviors: [patrol({ waypoints: [[0, 0, 0], [10, 0, 0]], speed: 4, loop: true })],
    });

    advanceBehaviors(c, 1);
    const after = c.scene.entity.get("car1");
    expect(after?.position[0]).toBeCloseTo(4);
    expect(after?.position[2]).toBeCloseTo(0);
  });

  test("moves a wander entity within its radius of the spawn origin", () => {
    const c = ctx();
    c.scene.entity.spawn("civ", {
      id: "civ1",
      position: [20, 0, 20],
      role: "prop",
      movement: { walkSpeed: 3 },
      behaviors: [wander({ radius: 6 })],
    });

    for (let i = 0; i < 20; i += 1) advanceBehaviors(c, 0.1);
    const after = c.scene.entity.get("civ1");
    const dist = Math.hypot((after?.position[0] ?? 0) - 20, (after?.position[2] ?? 0) - 20);
    expect(after?.position[0]).not.toBe(20);
    expect(dist).toBeLessThanOrEqual(6 + 1e-6);
  });

  test("is a no-op for entities without patrol/wander behaviors", () => {
    const c = ctx();
    c.scene.entity.spawn("rock", { id: "rock1", position: [5, 0, 5], role: "prop" });
    advanceBehaviors(c, 1);
    expect(c.scene.entity.get("rock1")?.position).toEqual([5, 0, 5]);
  });

  test("drops nav state when a behavior entity despawns", () => {
    const c = ctx();
    c.scene.entity.spawn("car", {
      id: "car2",
      position: [0, 0, 0],
      behaviors: [patrol({ waypoints: [[0, 0, 0], [10, 0, 0]], speed: 4 })],
    });
    advanceBehaviors(c, 0.1);
    c.scene.entity.despawn("car2");
    expect(() => advanceBehaviors(c, 0.1)).not.toThrow();
    expect(c.scene.entity.get("car2")).toBeNull();
  });
});
