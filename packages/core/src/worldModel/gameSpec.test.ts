import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "../game/defineGame";
import { createGameContext } from "../runtime/gameContext";
import { defineGameSpec } from "./gameSpec";

const spawned: string[] = [];
const removed: string[] = [];
const paged: string[] = [];

// A whole (tiny) tower defense: the world is data; spawning towers and paging a hook is the only code.
const bastion = defineGameSpec({
  id: "bastion",
  world: {
    factions: { keep: { facts: { gold: { value: 200, min: 0 }, lives: 10 } } },
    slots: { plot: { p1: { position: [5, 5] }, p2: { position: [9, 5] } } },
    kinds: { archer: { label: "Archer tower", slot: "plot", cost: { "keep.gold": -150 }, takes: 1, refund: 0.5, facts: { level: 1 } } },
    actions: { sell: { label: "Sell", on: "archer", removes: true } },
    ripples: { leak: { world: { "keep.lives": -1 }, note: "A raider slipped through.", hook: "shake_camera" } },
    totals: { "keep.towers": { of: "archer" } },
  },
  hooks: { shake_camera: (_ctx, call) => paged.push(call.event?.kind ?? "") },
  onReady: (_ctx, tower) => spawned.push(`${tower.id}@${tower.position?.join(",")}`),
  onRemoved: (_ctx, id) => removed.push(id),
});

const game = defineGameDefinition({ name: "bastion-spec", multiplayer: "off", systems: [bastion.system] });
const boot = () => {
  const ctx = createGameContext({ definition: game, content: {}, player: { userId: "keeper", isNew: true } });
  game.loop?.onInit?.(ctx);
  return ctx;
};
const advance = (ctx: ReturnType<typeof boot>, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.25) game.loop?.onTick?.(ctx, 0.25);
};

describe("a game spec runs as an engine system", () => {
  test("commands place, refuse with a reason and sell; the tick spawns and despawns through the hooks", () => {
    const ctx = boot();
    expect(ctx.game.commands.run("bastion.place", { kind: "archer", slot: "p1" })).toMatchObject({ status: "applied" });
    expect(ctx.game.commands.run("bastion.place", { kind: "archer", slot: "p2" })).toMatchObject({ status: "rejected", reason: "cost", message: "Archer tower needs 100 more gold" });
    advance(ctx, 1);
    expect(spawned).toEqual(["archer-1@5,5"]);
    expect(bastion.of(ctx).num("keep.towers")).toBe(1);
    expect(ctx.game.commands.run("bastion.act", { action: "sell", target: "archer-1" })).toMatchObject({ status: "applied" });
    advance(ctx, 0.25);
    expect(removed).toEqual(["archer-1"]);
    expect(bastion.of(ctx).num("keep.gold")).toBe(125);
    bastion.emit(ctx, { kind: "leak" });
    expect(bastion.of(ctx).num("keep.lives")).toBe(9);
    expect(paged).toEqual(["leak"]);
  });

  test("the world is one store, so a save restores it whole", () => {
    const live = boot();
    live.game.commands.run("bastion.place", { kind: "archer", slot: "p2" });
    advance(live, 0.5);
    const saved = JSON.parse(JSON.stringify(live.state()));
    const restored = boot();
    restored.restore(saved);
    expect(bastion.of(restored).orders()[0]?.progress).toBeCloseTo(0.5);
    expect(bastion.of(restored).num("keep.gold")).toBe(50);
  });

  test("a declaration that names a hook the spec doesn't supply is refused up front", () => {
    expect(() => defineGameSpec({ id: "broken", world: { ripples: { boom: { hook: "explode" } } } })).toThrow(/names hook "explode"/);
  });
});
