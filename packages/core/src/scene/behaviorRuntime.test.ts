import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "../game/defineGame";
import { createGameContext } from "../runtime/gameContext";
import { advanceBehaviors, behaviorControl } from "./behaviorRuntime";
import { patrol, wander } from "./behaviors";

function ctx() {
  const definition = defineGameDefinition({ name: "Behaviors", multiplayer: "off" });
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

  test("seeds a patrol at its startProgress instead of waypoint zero", () => {
    const c = ctx();
    c.scene.entity.spawn("car", {
      id: "seeded",
      position: [0, 0, 0],
      role: "prop",
      behaviors: [
        patrol({
          waypoints: [[0, 0, 0], [10, 0, 0]],
          speed: 4,
          loop: true,
          startProgress: { kind: "distance", value: 6 },
        }),
      ],
    });
    // First tick poses the entity from the seeded phase (6 units in), not from 0.
    advanceBehaviors(c, 0.001);
    expect(c.scene.entity.get("seeded")?.position[0]).toBeGreaterThan(5.9);
  });
});

describe("behaviorControl lifecycle", () => {
  function patrolCtx(id: string) {
    const c = ctx();
    c.scene.entity.spawn("car", {
      id,
      position: [0, 0, 0],
      role: "prop",
      behaviors: [patrol({ waypoints: [[0, 0, 0], [10, 0, 0], [10, 0, 10]], speed: 4, loop: true })],
    });
    return c;
  }

  test("pause freezes advancement; resume with freeze policy is equivalent to never ticking the paused span", () => {
    const baseline = patrolCtx("b");
    for (let i = 0; i < 10; i += 1) advanceBehaviors(baseline, 0.1);
    const expected = baseline.scene.entity.get("b")!.position;

    const paused = patrolCtx("p");
    const control = behaviorControl(paused);
    for (let i = 0; i < 5; i += 1) advanceBehaviors(paused, 0.1);
    expect(control.pause("p")).toBe(true);
    expect(control.status("p")).toBe("paused");
    for (let i = 0; i < 4; i += 1) advanceBehaviors(paused, 0.1); // no advance while paused
    expect(control.resume("p")).toBe(true);
    for (let i = 0; i < 5; i += 1) advanceBehaviors(paused, 0.1);

    const actual = paused.scene.entity.get("p")!.position;
    expect(actual[0]).toBeCloseTo(expected[0]);
    expect(actual[2]).toBeCloseTo(expected[2]);
  });

  test("resume with advance policy catches up the paused elapsed time silently", () => {
    const baseline = patrolCtx("bc");
    for (let i = 0; i < 10; i += 1) advanceBehaviors(baseline, 0.1);
    const expected = baseline.scene.entity.get("bc")!.position;

    const caught = patrolCtx("cc");
    const control = behaviorControl(caught);
    for (let i = 0; i < 5; i += 1) advanceBehaviors(caught, 0.1);
    control.pause("cc");
    for (let i = 0; i < 5; i += 1) advanceBehaviors(caught, 0.1); // accrues 0.5s paused
    control.resume("cc", "advance"); // fast-forwards 0.5s of route
    const actual = caught.scene.entity.get("cc")!.position;
    expect(actual[0]).toBeCloseTo(expected[0]);
    expect(actual[2]).toBeCloseTo(expected[2]);
  });

  test("seek jumps a live patrol to a semantic progress and poses it there", () => {
    const c = patrolCtx("s");
    const control = behaviorControl(c);
    expect(control.seek("s", { kind: "distance", value: 10 })).toBe(true);
    advanceBehaviors(c, 0.001);
    const pos = c.scene.entity.get("s")!.position;
    expect(pos[0]).toBeCloseTo(10, 1);
    expect(pos[2]).toBeGreaterThan(0);
  });

  test("serialize round-trips exactly through restore", () => {
    const c = patrolCtx("r");
    const control = behaviorControl(c);
    for (let i = 0; i < 7; i += 1) advanceBehaviors(c, 0.1);
    const snapshot = control.serialize("r");
    expect(snapshot?.kind).toBe("patrol");
    // Drift the live state, then restore and confirm the snapshot round-trips byte-for-byte.
    for (let i = 0; i < 3; i += 1) advanceBehaviors(c, 0.1);
    expect(control.restore("r", snapshot!)).toBe(true);
    const restored = control.serialize("r");
    expect(restored).toEqual(snapshot);
  });

  test("disable stops output until enable, leaving the entity frozen in place", () => {
    const c = patrolCtx("d");
    const control = behaviorControl(c);
    advanceBehaviors(c, 0.5);
    const frozenAt = [...c.scene.entity.get("d")!.position];
    expect(control.disable("d", "streamed-out")).toBe(true);
    expect(control.status("d")).toBe("disabled");
    expect(control.reason("d")).toBe("streamed-out");
    for (let i = 0; i < 5; i += 1) advanceBehaviors(c, 0.1);
    expect(c.scene.entity.get("d")!.position).toEqual(frozenAt as [number, number, number]);
    expect(control.enable("d")).toBe(true);
    advanceBehaviors(c, 0.1);
    expect(c.scene.entity.get("d")!.position[0]).not.toBe(frozenAt[0]);
  });

  test("non-patrol (wander) instances pause, disable, and inspect through the same control", () => {
    const c = ctx();
    c.scene.entity.spawn("civ", {
      id: "w1",
      position: [0, 0, 0],
      role: "prop",
      movement: { walkSpeed: 3 },
      behaviors: [wander({ radius: 5 })],
    });
    const control = behaviorControl(c);
    expect(control.inspect("w1")).toEqual({ id: "w1", kind: "wander", status: "active", reason: null });

    expect(control.pause("w1", "possessed")).toBe(true);
    const frozen = [...c.scene.entity.get("w1")!.position];
    for (let i = 0; i < 10; i += 1) advanceBehaviors(c, 0.1);
    expect(c.scene.entity.get("w1")!.position).toEqual(frozen as [number, number, number]);

    expect(control.resume("w1")).toBe(true);
    for (let i = 0; i < 10; i += 1) advanceBehaviors(c, 0.1);
    expect(c.scene.entity.get("w1")!.position).not.toEqual(frozen as [number, number, number]);

    expect(control.list().some((i) => i.id === "w1")).toBe(true);
  });
});
