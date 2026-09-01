import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "../game/defineGame";
import { offline } from "./adapter";
import type { GameContext } from "./gameContext";
import { createHeadlessRunner } from "./headlessRunner";
import { createInputRecorder } from "./inputRecorder";
import { createSimSnapshotRegistry } from "./simSnapshot";

function jitterGame(hz: number) {
  return defineGameDefinition({
    name: "Replay Probe",
    multiplayer: offline(),
    simulation: { hz },
    loop: {
      onNewPlayer(ctx: GameContext) {
        ctx.scene.entity.spawn("hero", { id: ctx.player.userId, position: [0, 0, 0] });
        ctx.scene.entity.spawn("drifter", { id: "drifter", position: [5, 0, 5] });
      },
      onTick(ctx: GameContext, dt: number) {
        const hero = ctx.scene.entity.get(ctx.player.userId);
        if (hero !== null) {
          const [x, y, z] = hero.position;
          const dx = (ctx.input.isDown("moveRight") ? 1 : 0) - (ctx.input.isDown("moveLeft") ? 1 : 0);
          ctx.scene.entity.setPose(ctx.player.userId, { position: [x + dx * 3 * dt, y, z], dt });
        }
        const drifter = ctx.scene.entity.get("drifter");
        if (drifter !== null) {
          const [x, y, z] = drifter.position;
          ctx.scene.entity.setPose("drifter", {
            position: [x + (ctx.rng() - 0.5) * dt, y, z + (ctx.rng() - 0.5) * dt],
            rotationY: drifter.rotationY + ctx.rng() * dt,
            dt,
          });
        }
      },
    },
  });
}

function poses(ctx: GameContext) {
  return ctx.scene.entity.list().map((entity) => [entity.id, ...entity.position, entity.rotationY]);
}

describe("fixed-step replay", () => {
  test("replaying recorded input from a snapshot reproduces the run exactly", () => {
    const runner = createHeadlessRunner({ definition: jitterGame(30), loop: jitterGame(30).loop! });
    const recorder = createInputRecorder();
    const start = runner.snapshot();
    const frameDts = [0.016, 0.02, 0.031, 0.05, 0.017, 0.033, 0.041, 0.012];
    let frame = 0;
    for (let i = 0; i < 40; i += 1) {
      const held = i % 7 < 3 ? ["moveRight"] : i % 7 === 5 ? ["moveLeft"] : [];
      recorder.record(runner.tick() + 1, { held, pointer: null });
      runner.step(frameDts[frame % frameDts.length]!, { held });
      frame += 1;
    }
    const expected = poses(runner.ctx);
    const endTick = runner.tick();
    expect(endTick).toBeGreaterThan(20);

    const replay = createHeadlessRunner({ definition: jitterGame(30), loop: jitterGame(30).loop! });
    replay.restore(start);
    while (replay.tick() < endTick) {
      const next = recorder.frameAt(replay.tick() + 1);
      replay.step(1 / 30, { held: next?.held ?? [] });
    }
    expect(poses(replay.ctx)).toEqual(expected);
  });

  test("a restored snapshot resumes the rng stream and clock", () => {
    const runner = createHeadlessRunner({ definition: jitterGame(20), loop: jitterGame(20).loop! });
    runner.step(0.05);
    const mid = runner.snapshot();
    const a = [runner.ctx.rng(), runner.ctx.rng()];
    runner.restore(mid);
    const b = [runner.ctx.rng(), runner.ctx.rng()];
    expect(b).toEqual(a);
    expect(runner.ctx.time.now()).toBeCloseTo(0.05);
  });

  test("game contributors ride the same registry", () => {
    const registry = createSimSnapshotRegistry();
    let score = 3;
    registry.register<number>({ id: "score", capture: () => score, restore: (v) => (score = v) });
    const saved = registry.capture();
    score = 9;
    registry.restore(saved);
    expect(score).toBe(3);
    expect(registry.ids()).toEqual(["score"]);
  });
});
