import { describe, expect, test } from "bun:test";
import type { HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { setDifficulty, type DifficultyId } from "./campaign";
import { castAt } from "./combat/cast";
import { tickTowers } from "./combat/towerAI";
import { keep, runEnded, towerOptions } from "./keep";
import { session } from "./session";
import { beaconRunner } from "./testing";
import { tickWaves } from "./waves/director";
import { BUILD_PLOTS } from "./world/path";
import { restartDefense } from "./world/setup";

/**
 * Pacing checks: a scripted defense played headless, start to finish, against the real director,
 * towers and economy. They pin the shape of the difficulty curve rather than exact numbers: doing
 * nothing loses, one kind of tower spammed loses to the raiders it can't answer, and a sensible
 * mixed keep holds on Knight without finishing with a fortune it never had to spend.
 * `BEACON_TRACE=1` prints each wave's walls, purse and towers, and every raider that broke through.
 */

interface Plan {
  /** Towers to raise, in order, one per free plot. */
  builds: readonly string[];
  /** Branch each tower kind takes at its fork. */
  branch: Record<string, string>;
  /** Whether the player upgrades at all. */
  upgrades: boolean;
  /** Plots in the order the player fills them; omitted means the list order. */
  plots?: readonly string[];
  /** Whether the player uses Beacon Fire and the Frost Bell. */
  rites?: boolean;
}

interface Outcome {
  held: boolean;
  wave: number;
  lives: number;
  gold: number;
  towers: number;
}

const DT = 0.1;

function spend(runner: HeadlessRunner, plan: Plan, built: { next: number }): void {
  const world = keep.of(runner.ctx);
  const order = plan.plots ?? BUILD_PLOTS.map((plot) => plot.id);
  const free = order.map((id) => BUILD_PLOTS.find((plot) => plot.id === id)!).find((plot) => world.occupant(plot.id) === null);
  const kind = plan.builds[built.next % plan.builds.length]!;
  if (free !== undefined && built.next < plan.builds.length) {
    if (world.canPlace(kind, { slot: free.id }) === null) {
      runner.ui.tryInvoke("beacon.place", { kind, slot: free.id });
      built.next += 1;
    }
    return;
  }
  if (!plan.upgrades) return;
  // Upgrade the cheapest step on the keep that the purse covers.
  let best: { id: string; action: string; cost: number } | null = null;
  for (const tower of world.instances()) {
    if (!tower.ready) continue;
    for (const option of towerOptions(world, tower.id, tower.kind)) {
      if (option.branch !== null && option.branch !== plan.branch[tower.kind]) continue;
      if (option.refusal !== null) continue;
      const cost = -((option.cost["keep.gold"] as number | undefined) ?? 0);
      if (best === null || cost < best.cost) best = { id: tower.id, action: option.action, cost };
    }
  }
  if (best !== null) runner.ui.tryInvoke("beacon.act", { action: best.action, target: best.id });
}

/** Drop the fire on the raider furthest down the road; ring the bell when a boss or a crowd is close. */
function useRites(runner: HeadlessRunner): void {
  let lead: { id: string; progress: number } | null = null;
  for (const creep of session.creeps.values()) {
    const progress = creep.path.distanceTravelled;
    if (lead === null || progress > lead.progress) lead = { id: creep.instanceId, progress };
  }
  if (lead === null) return;
  if (runner.ui.tryInvoke("abilityFire", {}).status === "applied") {
    const at = runner.ctx.scene.entity.get(lead.id)?.position;
    if (at !== undefined) castAt(runner.ctx, at);
  }
  if (session.boss !== null || session.creeps.size >= 8) runner.ui.tryInvoke("abilityBell", {});
}

function playDefense(plan: Plan, difficulty: DifficultyId = "knight"): Outcome {
  const runner = beaconRunner("Beacon balance");
  setDifficulty(runner.ctx, difficulty);
  restartDefense(runner.ctx);
  const built = { next: 0 };
  runner.ui.invoke("wave.send", {});
  let spendIn = 0;
  let lastWave = 0;
  const trace: string[] = [];
  for (let t = 0; t < 1500 && !runEnded(keep.of(runner.ctx)); t += DT) {
    const now = session.encounter.view().wave;
    if (now !== lastWave) {
      const w = keep.of(runner.ctx);
      trace.push(`w${now}:L${w.num("keep.lives")}:G${w.num("keep.gold")}:T${w.instances().length}`);
      lastWave = now;
    }
    runner.step(DT);
    keep.system.update?.(runner.ctx, DT);
    const before = new Map([...session.creeps.values()].map((creep) => [creep.instanceId, creep]));
    const lives = keep.of(runner.ctx).num("keep.lives");
    tickWaves(runner.ctx, DT);
    if (process.env.BEACON_TRACE && keep.of(runner.ctx).num("keep.lives") < lives) {
      for (const [id, creep] of before) if (!session.creeps.has(id) && creep.path.done) trace.push(`leak:${creep.catalogId}`);
    }
    tickTowers(runner.ctx, DT);
    spendIn -= DT;
    if (spendIn <= 0) {
      spend(runner, plan, built);
      if (plan.rites === true) useRites(runner);
      spendIn = 1;
    }
  }
  const world = keep.of(runner.ctx);
  if (process.env.BEACON_TRACE) console.log(trace.join(" "));
  return {
    held: world.fact("keep.held") === true,
    wave: session.encounter.view().wave,
    lives: world.num("keep.lives"),
    gold: world.num("keep.gold"),
    towers: world.instances().length,
  };
}

const MIXED: Plan = {
  builds: ["tower_archer", "tower_cannon", "tower_archer", "tower_frost", "tower_arcane", "tower_cannon", "tower_archer", "tower_arcane", "tower_frost", "tower_cannon", "tower_archer"],
  branch: { tower_archer: "longbow", tower_cannon: "ironshot", tower_frost: "glacier", tower_arcane: "storm" },
  upgrades: true,
  // The corners where the road doubles back first, then the flank's mouth, then the long legs.
  plots: ["plot-5", "plot-4", "plot-10", "plot-6", "plot-8", "plot-3", "plot-7", "plot-11", "plot-2", "plot-9", "plot-1"],
  rites: true,
};

describe("pacing", () => {
  test("an empty keep falls early", () => {
    const outcome = playDefense({ builds: [], branch: {}, upgrades: false });
    expect(outcome.held).toBe(false);
    expect(outcome.wave).toBeLessThanOrEqual(3);
  });

  test("a mixed, upgraded keep holds on Knight, losing walls on the way and never sitting on a fortune", () => {
    const outcome = playDefense(MIXED);
    expect(outcome.held).toBe(true);
    expect(outcome.lives).toBeLessThan(20);
    expect(outcome.gold).toBeLessThan(300);
  });

  test("cannons alone can't answer the wraiths", () => {
    const outcome = playDefense({ ...MIXED, builds: Array(11).fill("tower_cannon"), branch: { tower_cannon: "mortar" } });
    expect(outcome.held).toBe(false);
  });

  test("Warlord is harder than Knight for the same keep", () => {
    const warlord = playDefense(MIXED, "warlord");
    const knight = playDefense(MIXED, "knight");
    expect(warlord.wave * 100 + warlord.lives).toBeLessThan(knight.wave * 100 + knight.lives);
  });
});
