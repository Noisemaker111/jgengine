import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "../game/defineGame";
import { createEmptyEditorDocument } from "../editor/document";
import type { ProjectileSettledEvent } from "../game/events";
import type { ProjectileShotInput } from "../combat/projectiles";
import { sweepMovingBounds } from "../physics/ballisticSweep";
import { createHeadlessRunner } from "./headlessRunner";
import type { GameContext } from "./gameContext";

const shot = (radius = 0): ProjectileShotInput => ({
  from: "shooter", via: { amount: 10 }, effect: "damage",
  aim: { origin: [0, 0.9, 0], direction: [0, 0, 1] },
  travel: { speed: 10, lifetime: 2, radius, maxAcceleration: 10 },
});

const content = {
  entityById: () => ({
    stats: { health: { max: 100 } }, receive: { damage: { order: ["health"] } },
    colliders: { hitboxes: [{ name: "body", purpose: "damage" as const, shape: { kind: "sphere" as const, radius: 0.1 }, damageEligible: true }] },
  }),
};

describe("GameContext projectile providers", () => {
  test("radius-aware cover sweep receives its context and authoritative segment and settles once", () => {
    const calls: { ctx: GameContext; radius: number; fromTime: number; toTime: number }[] = [];
    const definition = defineGameDefinition({
      name: "Radius cover", multiplayer: "off", persist: false, simulation: { hz: 10 },
      physics: { projectileObstacles: true },
      projectileTravel: {
        maxActive: 2, maxRetained: 2,
        sweep(ctx, from, to, step) {
          calls.push({ ctx, radius: step.radius, fromTime: step.fromTime, toTime: step.toTime });
          expect(from).toEqual([0, 0.9, 0]);
          expect(to).toEqual([0, 0.9, 1]);
          const cover = ctx.scene.object.list().find(object => object.catalogId === "wall")!;
          const half = 0.1 + step.radius;
          const fraction = sweepMovingBounds(from, to, cover.position, cover.position, [half, half, half]);
          return fraction === null ? null : { fraction, at: [0, 0.9, fraction] };
        },
      },
    });
    const runner = createHeadlessRunner({ definition, maxStepSeconds: 1 });
    const ctx = runner.ctx;
    ctx.scene.object.place("wall", 0.6, 0.9, 0.8);
    const reports: ProjectileSettledEvent[] = [];
    ctx.game.events.on("projectile.settled", report => reports.push(report));
    const id = ctx.scene.entity.fireProjectile(shot(0.5));
    ctx.time.pause();
    runner.step(0.1);
    expect(calls).toEqual([]);
    ctx.time.play();
    runner.step(0.1);
    expect(calls).toEqual([{ ctx, radius: 0.5, fromTime: 0, toTime: 0.1 }]);
    expect(reports.map(report => [report.shotId, report.hit])).toEqual([[id, false]]);
    expect(reports[0]!.at[2]).toBeCloseTo(0.2);
    runner.step(0.1);
    expect(reports).toHaveLength(1);
    expect(ctx.scene.entity.activeProjectiles()).toEqual([]);
  });

  test("one definition selects independent bounded targets in two worlds", () => {
    const seen: GameContext[] = [];
    const definition = defineGameDefinition({
      name: "World targets", multiplayer: "off", persist: false, simulation: { hz: 10 },
      projectileTravel: { maxTargets: 1, targets(ctx) { seen.push(ctx); return [ctx.player.userId]; } },
    });
    const left = createHeadlessRunner({ definition, content, player: { userId: "left", isNew: true }, maxStepSeconds: 1 });
    const right = createHeadlessRunner({ definition, content, player: { userId: "right", isNew: true }, maxStepSeconds: 1 });
    for (const runner of [left, right]) {
      runner.ctx.scene.entity.spawn("receiver", { id: runner.ctx.player.userId, position: [0, 0.9, 0.5] });
      runner.ctx.scene.entity.spawn("receiver", { id: "excluded", position: [0, 0.9, 0.2] });
      runner.ctx.scene.entity.fireProjectile(shot());
      runner.step(0.1);
      expect(runner.ctx.scene.entity.stats.get(runner.ctx.player.userId, "health")?.current).toBe(90);
      expect(runner.ctx.scene.entity.stats.get("excluded", "health")?.current).toBe(100);
    }
    expect(seen).toEqual([left.ctx, left.ctx, right.ctx, right.ctx]);
  });

  test("custom bounded target source avoids enumerating more than 2048 world entities", () => {
    let reads = 0;
    const runner = createHeadlessRunner({
      definition: defineGameDefinition({
        name: "Large world", multiplayer: "off", persist: false, simulation: { hz: 10 },
        projectileTravel: { maxTargets: 1, targets(ctx) { reads++; return ctx.scene.entity.get("receiver") === null ? [] : ["receiver"]; } },
      }), content, maxStepSeconds: 1,
    });
    const ctx = runner.ctx;
    ctx.scene.entity.spawn("receiver", { id: "receiver", position: [0, 0.9, 0.5] });
    for (let i = 0; i < 2050; i++) ctx.scene.entity.spawn("receiver", { id: `far-${i}`, position: [100 + i, 0, 0] });
    ctx.scene.entity.fireProjectile(shot());
    runner.step(0.1);
    expect(reads).toBe(2);
    expect(ctx.scene.entity.stats.get("receiver", "health")?.current).toBe(90);
    expect(ctx.scene.entity.stats.get("far-0", "health")?.current).toBe(100);
  });

  test("supplied acceleration overrides authored forces and can explicitly compose them", () => {
    const document = createEmptyEditorDocument();
    document.simulation = { weather: { wind: { direction: [1, 0], speed: 4, seed: "wind" } } };
    const calls: { ctx: GameContext; time: number }[] = [];
    const definition = defineGameDefinition({
      name: "Acceleration policy", multiplayer: "off", persist: false, simulation: { hz: 10 }, authoredDocument: document,
      projectileTravel: {
        acceleration(ctx, position, _velocity, at, input) {
          calls.push({ ctx, time: at });
          const base = ctx.player.userId === "compose"
            ? ctx.environment.accelerationAt(position, at, input.travel?.windResponse ?? 0, input.travel?.maxAcceleration ?? 0, input.travel?.forceMask ?? 0)
            : [0, 0, 0];
          return [base[0]!, base[1]! + 2, base[2]!];
        },
      },
    });
    const runners = ["override", "compose"].map(userId => createHeadlessRunner({ definition, player: { userId, isNew: true }, maxStepSeconds: 1 }));
    for (const runner of runners) {
      const input = shot();
      input.travel!.windResponse = 1;
      runner.ctx.scene.entity.fireProjectile(input);
      runner.step(0.1);
    }
    expect(runners[0]!.ctx.scene.entity.activeProjectiles()[0]!.position).toEqual([0, 0.91, 1]);
    expect(runners[1]!.ctx.scene.entity.activeProjectiles()[0]!.position[0]).toBeCloseTo(0.02);
    expect(runners[1]!.ctx.scene.entity.activeProjectiles()[0]!.position[1]).toBeCloseTo(0.91);
    expect(calls).toEqual(runners.map(runner => ({ ctx: runner.ctx, time: 0 })));
  });

  test("omitted providers retain authored acceleration and centerline cover", () => {
    const document = createEmptyEditorDocument();
    document.simulation = { weather: { wind: { direction: [1, 0], speed: 4, seed: "wind" } } };
    const runner = createHeadlessRunner({ definition: defineGameDefinition({
      name: "Defaults", multiplayer: "off", persist: false, simulation: { hz: 10 }, authoredDocument: document,
      physics: { projectileObstacles: true }, projectileTravel: { maxTargets: 10 },
    }), content: { objectById: () => ({ halfExtents: [0.5, 0.5, 0.5] }) }, maxStepSeconds: 1 });
    const input = shot();
    input.travel!.windResponse = 1;
    runner.ctx.scene.entity.fireProjectile(input);
    runner.step(0.1);
    expect(runner.ctx.scene.entity.activeProjectiles()[0]!.position[0]).toBeCloseTo(0.02);
    runner.ctx.scene.object.place("wall", 0, 0.9, 1.5);
    runner.step(0.1);
    expect(runner.ctx.scene.entity.activeProjectiles()).toEqual([]);
  });

  test("callbacks remain world policy across detached save and restore", () => {
    const calls: GameContext[] = [];
    const definition = defineGameDefinition({
      name: "Policy restore", multiplayer: "off", persist: false, simulation: { hz: 10 },
      projectileTravel: { acceleration(ctx) { calls.push(ctx); return [2, 0, 0]; }, targets: () => [] },
    });
    const runner = createHeadlessRunner({ definition, maxStepSeconds: 1 });
    runner.ctx.scene.entity.fireProjectile(shot());
    runner.step(0.1);
    const state = JSON.parse(JSON.stringify(runner.ctx.state()));
    runner.step(0.1);
    const expected = runner.ctx.scene.entity.activeProjectiles();
    runner.ctx.restore(state);
    runner.step(0.1);
    expect(runner.ctx.scene.entity.activeProjectiles()).toEqual(expected);
    const cold = createHeadlessRunner({ definition, maxStepSeconds: 1 });
    cold.ctx.restore(state);
    cold.step(0.1);
    expect(cold.ctx.scene.entity.activeProjectiles()).toEqual(expected);
    expect(calls).toEqual([runner.ctx, runner.ctx, runner.ctx, cold.ctx]);
  });
});
