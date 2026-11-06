import { describe, expect, test } from "bun:test";

import { environment, terrain } from "@jgengine/core/world/features";
import { defineGame } from "@jgengine/shell/defineGame";

import { runGameSuite, runSuiteProof } from "./runSuiteProof.draw";
import { defineProof } from "./suiteProof";

/** A crafting game in miniature: fire (mouse0) earns wood, `craft` turns 3 wood into a hut, `grant` cheats. */
function fixture() {
  return defineGame({
    name: "Suite Fixture",
    world: environment({ terrain: terrain() }),
    input: { moveForward: ["KeyW"], fire: ["mouse0"] },
    content: { entityById: (id) => (id === "hero" ? { role: "player", movement: { walkSpeed: 4 } } : null) },
    loop: {
      onInit(ctx) {
        ctx.game.store.set("wood", 0);
        ctx.game.store.set("huts", 0);
        ctx.game.commands.define("start", { apply: () => {} });
        ctx.game.commands.define("fire", { apply: (state) => state.game.store.set("wood", Number(state.game.store.get("wood")) + 1) });
        ctx.game.commands.define("craft", {
          validate: (state) => (Number(state.game.store.get("wood")) >= 3 ? null : { reason: "needs-wood" }),
          apply: (state) => {
            state.game.store.set("wood", Number(state.game.store.get("wood")) - 3);
            state.game.store.set("huts", Number(state.game.store.get("huts")) + 1);
          },
        });
        ctx.game.commands.define("grant", { cheat: true, apply: (state) => state.game.store.set("huts", Number(state.game.store.get("huts")) + 1) });
        ctx.game.commands.define("debugWood", { apply: (state) => state.game.store.set("wood", 99) });
      },
      onNewPlayer(ctx) {
        ctx.scene.entity.spawn("hero", { id: ctx.player.userId, position: [0, 0, 0] });
      },
    },
    capture: {
      play: ["start"],
      probe: (ctx) => ({ wood: Number(ctx.game.store.get("wood")), huts: Number(ctx.game.store.get("huts")) }),
    },
  });
}

describe("runSuiteProof", () => {
  test("setup may seed state directly; play proves through a key and the game's own command", async () => {
    const proof = defineProof(fixture(), {
      proves: ["building.place-snap"],
      setup(s) {
        s.ctx.game.store.set("wood", 2);
      },
      async play(p) {
        await p.press("mouse0");
        await p.act("craft");
        await p.expect((r) => r.huts === 1, "a hut built from gathered wood");
      },
    });
    const { report } = await runSuiteProof(proof);
    expect(report.ok).toBe(true);
  });

  test("a cheat command in play fails the proof, by its flag or by its name", async () => {
    for (const cheat of ["grant", "debugWood"]) {
      const proof = defineProof(fixture(), {
        proves: ["building.place-snap"],
        async play(p) {
          await p.act(cheat);
          await p.act("craft").catch(() => {});
          await p.expect((r) => r.huts >= 1, "a hut");
        },
      });
      const { report } = await runSuiteProof(proof);
      if (report.ok) throw new Error(`${cheat} should fail the proof`);
      expect(report.failure.message).toContain(`cheat command "${cheat}"`);
    }
  });

  test("a context kept from setup refuses writes during play", async () => {
    let kept: { set(key: string, value: number): void } | null = null;
    const proof = defineProof(fixture(), {
      proves: ["building.place-snap"],
      setup(s) {
        kept = s.ctx.game.store;
      },
      async play(p) {
        kept?.set("huts", 1);
        await p.press("mouse0");
        await p.expect((r) => r.huts === 1, "a hut");
      },
    });
    const { report } = await runSuiteProof(proof);
    if (report.ok) throw new Error("expected a failure");
    expect(report.failure.message).toContain("setup has ended");
  });

  test("an outcome setup already produced does not count", async () => {
    const proof = defineProof(fixture(), {
      proves: ["building.place-snap"],
      setup(s) {
        s.command("grant");
      },
      async play(p) {
        await p.press("mouse0");
        await p.expect((r) => r.huts === 1, "a hut");
      },
    });
    const { report } = await runSuiteProof(proof);
    if (report.ok) throw new Error("expected a failure");
    expect(report.failure.label).toBe("verdict");
    expect(report.failure.message).toContain("already true when play began");
  });

  test("play with no player action fails", async () => {
    const proof = defineProof(fixture(), {
      proves: ["building.place-snap"],
      async play(p) {
        await p.wait(100);
        await p.expect((r) => r.huts === 0, "no hut");
      },
    });
    const { report } = await runSuiteProof(proof);
    if (report.ok) throw new Error("expected a failure");
    expect(report.failure.message).toContain("no player action");
  });

  test("runGameSuite records each proof's result and the failing step", async () => {
    const game = fixture();
    const passing = defineProof(game, {
      proves: ["building.place-snap"],
      async play(p) {
        for (let shot = 0; shot < 3; shot += 1) await p.press("mouse0");
        await p.act("craft");
        await p.expect((r) => r.huts === 1, "a hut");
      },
    });
    const failing = defineProof(game, {
      proves: ["crafting.station-tiers"],
      async play(p) {
        await p.act("craft");
        await p.expect((r) => r.huts === 1, "a hut");
      },
    });
    const report = await runGameSuite("fixture", [{ file: "a.proof.ts", proof: passing }, { file: "b.proof.ts", proof: failing }], null);
    expect(report.proofs[0]).toEqual({ file: "a.proof.ts", proves: ["building.place-snap"], ok: true });
    expect(report.proofs[1]?.ok).toBe(false);
    expect(report.proofs[1]?.failure).toContain("needs-wood");
  });
});
