import { describe, expect, test } from "bun:test";

import { environment, terrain } from "@jgengine/core/world/features";
import { defineGame } from "@jgengine/shell/defineGame";
import { defineFlow } from "./flow";
import { describeFlowReport } from "./flowSteps";
import { runFlowHeadless } from "./headlessFlow.draw";

function fixture() {
  return defineGame({
    name: "Flow Fixture",
    world: environment({ terrain: terrain() }),
    input: { moveForward: ["KeyW"], fire: ["mouse0"], interact: ["KeyE"] },
    content: {
      entityById: (id) => (id === "hero" ? { role: "player", movement: { walkSpeed: 4 } } : null),
    },
    loop: {
      onInit(ctx) {
        ctx.game.store.set("started", 0);
        ctx.game.store.set("shots", 0);
        ctx.game.commands.define("start", { apply: (state) => state.game.store.set("started", 1) });
        ctx.game.commands.define("arena", { apply: (state) => state.game.store.set("started", 2) });
        ctx.game.commands.define("fire", { apply: (state) => state.game.store.set("shots", Number(state.game.store.get("shots")) + 1) });
        ctx.game.commands.define("locked", {
          validate: () => ({ ok: false, reason: "locked" }),
          apply: () => {},
        });
      },
      onNewPlayer(ctx) {
        ctx.scene.entity.spawn("hero", { id: ctx.player.userId, position: [0, 0, 0] });
      },
    },
    capture: {
      play: ["start"],
      states: { arena: ["arena"] },
      probe: (ctx) => {
        const hero = ctx.scene.entity.get(ctx.player.userId);
        return {
          x: hero?.position[0] ?? 0,
          z: hero?.position[2] ?? 0,
          started: Number(ctx.game.store.get("started")),
          shots: Number(ctx.game.store.get("shots")),
          clock: ctx.time.now(),
        };
      },
    },
  });
}

describe("runFlowHeadless", () => {
  test("boots through capture.play, walks until the probe says it arrived, and fires a bound key", async () => {
    const game = fixture();
    const flow = defineFlow(game, {
      async run(f) {
        await f.expect((p) => p.started === 1, "capture.play ran");
        await f.hold("KeyW", { until: (p) => Math.hypot(p.x, p.z) > 2 });
        await f.press("mouse0");
        await f.waitFor((p) => p.shots === 1);
        await f.report("after walk");
      },
    });
    const report = await runFlowHeadless(flow);
    expect(describeFlowReport("fixture", report).join("\n")).toContain("passed");
    expect(report.ok).toBe(true);
    expect(report.reports).toHaveLength(1);
  });

  test("a probe check that never passes fails at that step with the readings", async () => {
    const flow = defineFlow(fixture(), {
      async run(f) {
        await f.wait(100);
        await f.waitFor((p) => p.shots > 5, { timeoutMs: 500, note: "six shots" });
      },
    });
    const report = await runFlowHeadless(flow);
    if (report.ok) throw new Error("expected a failure");
    expect(report.failure.index).toBe(3);
    expect(report.failure.label).toBe("wait for six shots");
    expect(report.failure.message).toContain("500 ms of game time");
    expect(report.failure.probe).toMatchObject({ shots: 0 });
  });

  test("a key the game binds to nothing fails instead of doing nothing", async () => {
    const flow = defineFlow(fixture(), { run: (f) => f.press("KeyQ") });
    const report = await runFlowHeadless(flow);
    if (report.ok) throw new Error("expected a failure");
    expect(report.failure.message).toContain("key KeyQ is bound to no action");
  });

  test("heading turns the walk direction without a pointer drag", async () => {
    const walk = async (yaw: number) => {
      let end = { x: 0, z: 0 };
      const flow = defineFlow(fixture(), {
        async run(f) {
          await f.heading(yaw);
          await f.hold("KeyW", { ms: 500 });
          end = await f.probe();
        },
      });
      const report = await runFlowHeadless(flow);
      expect(report.ok).toBe(true);
      return end;
    };
    const straight = await walk(0);
    const turned = await walk(Math.PI / 2);
    expect(Math.abs(straight.x)).toBeLessThan(0.01);
    expect(Math.abs(turned.x)).toBeGreaterThan(1);
    expect(Math.abs(turned.z)).toBeLessThan(0.01);
  });

  test("teleport, commands, refusals and time scale", async () => {
    const flow = defineFlow(fixture(), {
      async run(f) {
        await f.teleport({ x: 10, z: -4 });
        await f.expect((p) => p.x === 10 && p.z === -4, "teleported");
        expect(await f.tryCommand("locked")).toEqual({ status: "rejected", reason: "locked" });
        const before = (await f.probe()).clock;
        await f.timeScale(10);
        await f.wait(1000);
        await f.expect((p) => p.clock - before > 9, "ten game seconds passed in one");
        await f.command("locked");
      },
    });
    const report = await runFlowHeadless(flow);
    if (report.ok) throw new Error("expected the locked command to fail the flow");
    expect(report.failure.label).toBe("command locked");
    expect(report.failure.message).toContain("rejected: locked");
  });

  test("state boots the named capture state, and an unknown one fails", async () => {
    const game = fixture();
    const arena = await runFlowHeadless(defineFlow(game, { state: "arena", run: (f) => f.expect((p) => p.started === 2, "arena state") }));
    expect(arena.ok).toBe(true);
    const missing = await runFlowHeadless(defineFlow(game, { state: "nowhere", run: async () => {} }));
    if (missing.ok) throw new Error("expected a failure");
    expect(missing.failure.message).toContain('unknown capture state "nowhere"');
  });
});
