import { describe, expect, test } from "bun:test";

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { environment, terrain } from "@jgengine/core/world/features";
import { defineGame } from "@jgengine/shell/defineGame";

import { runGameSuite, runSuiteProof } from "./runSuiteProof.draw";
import { defineProof } from "./suiteProof";

/** What a game helper kept from the last context it saw; the fixture's `tally` command writes through it. */
let remembered: GameContext | null = null;

/** A crafting game in miniature: fire (mouse0) earns wood, `craft` turns 3 wood into a hut, `grant` cheats. */
function fixture(autosaveMs?: number) {
  return defineGame({
    name: "Suite Fixture",
    ...(autosaveMs === undefined ? {} : { persist: { storage: "memory" as const, autosaveMs } }),
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
        ctx.game.commands.define("tally", {
          apply: (state) => {
            const at = remembered ?? state;
            at.game.store.set("huts", Number(at.game.store.get("huts")) + 1);
          },
        });
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
  // In CI a game's wall-clock autosave fired after its proof ended, read the closed setup view and threw
  // an unhandled SetupClosedError into the next test file. The proof now disposes the session's save.
  test("a game's autosave never fires after its proof ends", async () => {
    const stray: unknown[] = [];
    const onError = (error: unknown) => stray.push(error);
    process.on("uncaughtException", onError);
    try {
      const proof = defineProof(fixture(5), {
        proves: ["building.place-snap"],
        setup(s) {
          s.ctx.game.store.set("wood", 2);
          // Game state that holds something setup reached, as a per-context model does.
          s.ctx.game.store.set("kept", { from: s.ctx.player });
        },
        async play(p) {
          await p.press("mouse0");
          await p.act("craft");
          await p.expect((r) => r.huts === 1, "a hut built from gathered wood");
        },
      });
      const { report } = await runSuiteProof(proof);
      expect(report.ok).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 60));
    } finally {
      process.off("uncaughtException", onError);
    }
    expect(stray).toEqual([]);
  });

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

  test("game code that kept the setup's context keeps working in play", async () => {
    remembered = null;
    const proof = defineProof(fixture(), {
      proves: ["building.place-snap"],
      setup(s) {
        // A game helper setup calls, which keeps the context it was handed, as a lazy store does.
        remembered = s.ctx;
      },
      async play(p) {
        await p.act("tally");
        await p.expect((r) => r.huts === 1, "the game's own command wrote through the context it kept");
      },
    });
    const { report } = await runSuiteProof(proof);
    expect(report.ok).toBe(true);
  });

  test("a command setup defines is a cheat in play", async () => {
    const proof = defineProof(fixture(), {
      proves: ["building.place-snap"],
      setup(s) {
        s.ctx.game.commands.define("build", { apply: (state) => state.game.store.set("huts", 1) });
      },
      async play(p) {
        await p.act("build");
        await p.expect((r) => r.huts === 1, "a hut");
      },
    });
    const { report } = await runSuiteProof(proof);
    if (report.ok) throw new Error("expected a failure");
    expect(report.failure.message).toContain('a command setup defined, "build"');
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

  test("play that only checks fails: nothing changed during play", async () => {
    const proof = defineProof(fixture(), {
      proves: ["building.place-snap"],
      setup(s) {
        s.ctx.game.store.set("wood", 5);
      },
      async play(p) {
        await p.expect((r) => r.wood === 5, "wood");
      },
    });
    const { report } = await runSuiteProof(proof);
    if (report.ok) throw new Error("expected a failure");
    expect(report.failure.message).toContain("already true when play began");
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
