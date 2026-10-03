import { describe, expect, test } from "bun:test";
import { createEmptyEditorDocument } from "../editor/document";
import { defineGameDefinition } from "../game/defineGame";
import { createHeadlessRunner } from "../runtime/headlessRunner";
import { installEnvironmentMotion, type EnvironmentMotionTarget } from "./environmentForces";

function boot(shelter = false, scale = 1) {
  const document = createEmptyEditorDocument();
  document.simulation = {
    weather: { wind: { direction: [1, 0], speed: 4 } },
    forces: [{ center: [0, 0, 0], shape: { kind: "sphere", radius: 100 }, strength: 0, attenuation: 0, mask: 1, vortex: { axis: [0, 1, 0], strength: 0, lift: 2 } }],
  };
  if (shelter) document.volumes = [{ id: "roof", kind: "shelter", shape: "box", center: { x: 0, y: 0, z: 0 }, halfExtents: { x: 10, y: 10, z: 10 } }];
  const runner = createHeadlessRunner({
    definition: defineGameDefinition({ name: "Environmental actor", authoredDocument: document, multiplayer: "off", simulation: { hz: 10 }, time: { scale }, physics: { gravity: 0, jumpVelocity: 0 }, persist: false }),
    content: { entityById: () => ({ role: "player", movement: { walkSpeed: 4 } }) },
    playerMovement: true,
    movement: { feel: { groundAcceleration: 0, groundFriction: 0, airAcceleration: 0 } },
    maxStepSeconds: 1,
    loop: { onNewPlayer(ctx) { ctx.scene.entity.spawn("hero", { id: ctx.player.userId, position: [0, 0, 0] }); } },
  });
  const target: EnvironmentMotionTarget = { entityId: "player", motion: runner.ctx.player.motion, windResponse: 1, maxAcceleration: 10, mask: 1 };
  return { runner, ctx: runner.ctx, target };
}

describe("authoritative environmental movement", () => {
  test("wind and independent lift drive actual movement once per fixed step, freeze and detach", () => {
    const { runner, ctx, target } = boot();
    const horizontal: [number, number][] = [];
    const vertical: number[] = [];
    let queries = 0;
    const detach = installEnvironmentMotion(ctx, { targets: () => {
      queries += 1;
      return [{ ...target, motion: {
        pushHorizontal(x, z) { horizontal.push([x, z]); target.motion.pushHorizontal(x, z); },
        impulse(y) { vertical.push(y); target.motion.impulse(y); },
      } }];
    } });
    runner.step(0.05);
    expect(queries).toBe(0);
    runner.step(0.05);
    const first = [...ctx.scene.entity.get("player")!.position];
    expect(first[0]).toBeCloseTo(0.04);
    expect(first[1]).toBeCloseTo(0.02);
    expect(horizontal).toEqual([[0.4, 0]]);
    expect(vertical).toEqual([0.2]);
    ctx.time.pause();
    runner.step(0.2);
    expect(ctx.scene.entity.get("player")!.position).toEqual(first);
    expect(queries).toBe(1);
    ctx.time.play();
    runner.step(0.2);
    expect(queries).toBe(3);
    expect(horizontal).toHaveLength(3);
    expect(vertical).toHaveLength(3);
    const beforeDetach = [...ctx.scene.entity.get("player")!.position];
    detach();
    detach();
    runner.step(0.1);
    expect(horizontal).toHaveLength(3);
    expect(ctx.scene.entity.get("player")!.position[0] - beforeDetach[0]!).toBeCloseTo(0.12);
  });

  test("scaled time, caps, masks and shelter operate through the same motion queues", () => {
    const scaled = boot(false, 2);
    installEnvironmentMotion(scaled.ctx, { targets: () => [scaled.target] });
    scaled.runner.step(0.1);
    expect(scaled.ctx.scene.entity.get("player")!.position[0]).toBeCloseTo(0.16);
    expect(scaled.ctx.scene.entity.get("player")!.position[1]).toBeCloseTo(0.08);

    const capped = boot();
    installEnvironmentMotion(capped.ctx, { targets: () => [{ ...capped.target, maxAcceleration: 1, mask: 0 }] });
    capped.runner.step(0.1);
    expect(capped.ctx.scene.entity.get("player")!.position[0]).toBeCloseTo(0.01);
    expect(capped.ctx.scene.entity.get("player")!.position.slice(1)).toEqual([0, 0]);

    const covered = boot(true);
    installEnvironmentMotion(covered.ctx, { targets: () => [{ ...covered.target, sheltered: true }] });
    covered.runner.step(0.1);
    expect(covered.ctx.scene.entity.get("player")!.position).toEqual([0, 0, 0]);
    const exposed = boot(true);
    installEnvironmentMotion(exposed.ctx, { targets: () => [exposed.target] });
    exposed.runner.step(0.1);
    expect(exposed.ctx.scene.entity.get("player")!.position[0]).toBeGreaterThan(0);
  });

  test.each(["response", "cap", "duplicate", "budget", "sink"] as const)("rejects invalid %s atomically before any target receives intents", (kind) => {
    const { runner, ctx, target } = boot();
    ctx.scene.entity.spawn("hero", { id: "second", position: [0, 0, 0] });
    let invalid: EnvironmentMotionTarget = { ...target, entityId: "second", motion: ctx.player.motionFor("second") };
    if (kind === "response") invalid = { ...invalid, windResponse: NaN };
    if (kind === "cap") invalid = { ...invalid, maxAcceleration: -1 };
    if (kind === "duplicate") invalid = { ...invalid, entityId: "player" };
    if (kind === "sink") invalid = { ...invalid, motion: { impulse: null, pushHorizontal: null } as unknown as EnvironmentMotionTarget["motion"] };
    const stop = installEnvironmentMotion(ctx, { targets: () => [target, invalid], maxTargets: kind === "budget" ? 1 : 2 });
    expect(() => runner.step(0.1)).toThrow();
    expect(ctx.player.motion.snapshot().horizontalImpulses).toEqual([]);
    expect(ctx.player.motion.snapshot().impulses).toEqual([]);
    expect(ctx.player.motionFor("second").snapshot().horizontalImpulses).toEqual([]);
    stop();
  });

  test("rejects invalid budgets at installation and skips despawned target ids", () => {
    const { runner, ctx, target } = boot();
    for (const maxTargets of [0, -1, 1.5, Infinity, 4097]) expect(() => installEnvironmentMotion(ctx, { targets: () => [target], maxTargets })).toThrow();
    installEnvironmentMotion(ctx, { targets: () => [{ ...target, entityId: "gone" }] });
    runner.step(0.1);
    expect(ctx.scene.entity.get("player")!.position).toEqual([0, 0, 0]);
  });
});
