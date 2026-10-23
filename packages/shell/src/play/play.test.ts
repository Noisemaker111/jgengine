import { describe, expect, test } from "bun:test";

import { environment, terrain } from "@jgengine/core/world/features";
import { defineGame } from "../defineGame";
import type { PlayableGame } from "../registry";
import { createPlayScript } from "./script";
import { runPlayScript } from "./run";
import { playTimelineDigest } from "./timeline";

function fixture(): PlayableGame {
  return defineGame({
    name: "Play Fixture",
    world: environment({ terrain: terrain() }),
    input: { moveForward: ["KeyW"], fire: ["mouse0"], interact: ["KeyE"] },
    content: {
      entityById: (id) =>
        id === "hero"
          ? { role: "player", stats: { health: { max: 100, min: 0 } }, receive: { damage: { order: ["health"] } }, movement: { walkSpeed: 4 } }
          : id === "raider"
            ? { role: "enemy", stats: { health: { max: 100, min: 0 } }, receive: { damage: { order: ["health"] } } }
            : null,
    },
    loop: {
      onInit(ctx) {
        ctx.game.commands.define<{ amount?: number }>("fire", {
          apply(state, input) {
            state.scene.entity.effect({
              from: state.player.userId,
              to: "raider-1",
              effect: "damage",
              via: { amount: input?.amount ?? 10 },
            });
          },
        });
        ctx.game.commands.define("charge", {
          apply(state) {
            state.game.store.set("charges", Number(state.game.store.get("charges") ?? 0) + 1);
          },
        });
      },
      onNewPlayer(ctx) {
        ctx.scene.entity.spawn("hero", { id: ctx.player.userId, position: [0, 0, 0] });
        ctx.scene.entity.spawn("raider", { id: "raider-1", position: [0, 0, 8] });
      },
      onTick(ctx, dt) {
        const player = ctx.scene.entity.get(ctx.player.userId);
        if (player === null) return;
        ctx.scene.entity.moveTowardCommit("raider-1", player.position, { speed: 1, stopDistance: 2, dt });
        const raider = ctx.scene.entity.get("raider-1");
        if (raider === null) return;
        // Seeded drift: the same seed must yield the same pose, a different seed a different one.
        ctx.scene.entity.setPose("raider-1", {
          position: [raider.position[0] + (ctx.rng() - 0.5) * 0.2, raider.position[1], raider.position[2]],
        });
      },
    },
  });
}

const hitScript = createPlayScript({
  seed: "fixture",
  steps: [
    { tick: 0, action: "command", name: "charge" },
    { tick: 1, action: "aim", yaw: 0 },
    { tick: 2, action: "fire" },
  ],
  expect: [
    { id: "raider-hurt", subject: "raider health", read: (ctx) => ctx.scene.entity.stats.get("raider-1", "health")?.current ?? null, test: (now, initial) => typeof now === "number" && typeof initial === "number" && now < initial },
    { id: "raider-closing", subject: "raider distance", read: (ctx) => ctx.scene.entity.distance("raider-1", ctx.player.userId), test: (now, initial) => typeof now === "number" && typeof initial === "number" && now < initial },
    { id: "charges", subject: "charge count", read: (ctx) => Number(ctx.game.store.get("charges") ?? 0), test: (now) => now === 1 },
  ],
});

describe("runPlayScript", () => {
  test("a bound fire command damages the enemy through the engine damage model", () => {
    const run = runPlayScript(fixture(), hitScript);
    expect(run.passed).toBe(true);
    const damage = run.timeline.find((entry) => entry.label === "combat.damage");
    expect(damage).toBeDefined();
    expect(damage!.values?.to).toBe("raider-1");
    expect(Number(damage!.values?.amount)).toBe(10);
    expect(run.timeline.some((entry) => entry.kind === "command" && entry.label === "action fire")).toBe(true);
  });

  test("a held move step drives the shell walk controller", () => {
    const game = fixture();
    const start = runPlayScript(game, createPlayScript({ seed: 1, ticks: 1, expect: [{ id: "start", read: (ctx) => ctx.scene.entity.get(ctx.player.userId)?.position[2] ?? null }] }));
    const moved = runPlayScript(
      game,
      createPlayScript({
        seed: 1,
        steps: [{ tick: 0, action: "move", move: "forward", ticks: 20 }],
        expect: [
          { id: "z", read: (ctx) => ctx.scene.entity.get(ctx.player.userId)?.position[2] ?? null },
          { id: "moved", read: (ctx) => ctx.scene.entity.get(ctx.player.userId)?.position[2] ?? null, test: (now, initial) => typeof now === "number" && typeof initial === "number" && now > initial + 0.2 },
        ],
      }),
    );
    expect(Number(start.expectations[0]!.value)).toBe(0);
    expect(moved.passed).toBe(true);
    expect(Number(moved.expectations[0]!.value)).toBeGreaterThan(0.2);
  });

  test("the same script and seed replay to the same timeline digest; another seed differs", () => {
    const first = runPlayScript(fixture(), hitScript);
    const second = runPlayScript(fixture(), hitScript);
    expect(second.digest).toBe(first.digest);
    const other = runPlayScript(fixture(), { ...hitScript, seed: "different" });
    expect(other.digest).not.toBe(first.digest);
  });

  test("a failed expectation is reported, named, and carries both readings", () => {
    const run = runPlayScript(
      fixture(),
      createPlayScript({
        seed: "hold",
        steps: [{ tick: 0, action: "wait", ticks: 5 }],
        expect: [{ id: "raider-died", subject: "raider health", read: (ctx) => ctx.scene.entity.stats.get("raider-1", "health")?.current ?? null, test: (now) => now === 0 }],
      }),
    );
    expect(run.passed).toBe(false);
    const failed = run.expectations.find((entry) => entry.id === "raider-died")!;
    expect(failed.pass).toBe(false);
    expect(failed.value).toBe(100);
    expect(failed.initial).toBe(100);
    expect(run.timeline.some((entry) => entry.kind === "check" && entry.label === "raider-died")).toBe(true);
  });

  test("a rejected command is recorded instead of throwing", () => {
    const run = runPlayScript(fixture(), createPlayScript({ seed: 1, steps: [{ tick: 0, action: "command", name: "nope" }] }));
    const row = run.timeline.find((entry) => entry.kind === "command")!;
    expect(row.values?.status).toBe("unknown-command");
  });

  test("the timeline digest is stable for a given timeline", () => {
    const run = runPlayScript(fixture(), hitScript);
    expect(playTimelineDigest([...run.timeline])).toBe(run.digest);
  });
});

describe("createPlayScript", () => {
  test("sorts steps, defaults durations and derives the run length", () => {
    const script = createPlayScript({
      seed: 3,
      steps: [
        { tick: 10, action: "fire" },
        { tick: 2, action: "move", move: "left", ticks: 4 },
      ],
      expect: [{ id: "late", at: 30, read: () => true }],
    });
    expect(script.steps.map((step) => step.tick)).toEqual([2, 10]);
    expect(script.steps[0]!.ticks).toBe(4);
    expect(script.steps[1]!.ticks).toBe(1);
    expect(script.totalTicks).toBe(30);
    expect(script.dt).toBeCloseTo(1 / 60);
  });

  test("rejects fractional ticks, empty ids and non-positive durations", () => {
    expect(() => createPlayScript({ seed: 1, steps: [{ tick: 1.5, action: "wait", ticks: 1 }] })).toThrow(/whole tick/);
    expect(() => createPlayScript({ seed: 1, steps: [{ tick: 0, action: "wait", ticks: 0 }] })).toThrow(/positive whole number/);
    expect(() => createPlayScript({ seed: 1, steps: [{ tick: 0, action: "command", name: " " }] })).toThrow(/non-empty command/);
    expect(() => createPlayScript({ seed: 1, expect: [{ id: "", read: () => true }] })).toThrow(/needs an id/);
  });
});
