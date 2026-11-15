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
import type { MapId } from "../maps";
import { restartDefense } from "./world/setup";

/**
 * Pacing checks: a scripted day played headless, start to finish, against the real director,
 * workers, distraction and economy. They pin the shape of the difficulty curve rather than exact
 * numbers: hiring nobody loses, one trade spammed loses to the tech it can't answer, and a sensible
 * mixed crew holds on Full-Time without finishing with a fortune it never had to spend.
 * `BEACON_TRACE=1` prints each wave's attention, cash and crew, and every gadget that got through.
 */

interface Plan {
  /** Workers to hire, in order, one per free plot. */
  builds: readonly string[];
  /** Career each worker takes at their fork. */
  branch: Record<string, string>;
  /** Whether the player upgrades at all. */
  upgrades: boolean;
  /** Plots in the order the player fills them; omitted means the list order. */
  plots?: readonly string[];
  /** Whether the player uses Blackout and Do Not Disturb. */
  rites?: boolean;
}

interface Outcome {
  held: boolean;
  wave: number;
  lives: number;
  /**
   * The purse when the run ends, less the bounty paid after the keep's last chance to buy: a final
   * kill lands its pay when nothing can be bought any more, so only gold the keep could have spent counts.
   */
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

/** Flip the breaker on the tech furthest down the street; press Do Not Disturb for a boss or a crowd. */
function useRites(runner: HeadlessRunner): void {
  let lead: { id: string; progress: number } | null = null;
  for (const creep of session.creeps.values()) {
    const progress = creep.path.distanceTravelled;
    if (lead === null || progress > lead.progress) lead = { id: creep.instanceId, progress };
  }
  if (lead === null) return;
  if (runner.ui.tryInvoke("abilityBlackout", {}).status === "applied") {
    const at = runner.ctx.scene.entity.get(lead.id)?.position;
    if (at !== undefined) castAt(runner.ctx, at);
  }
  if (session.boss !== null || session.creeps.size >= 8) runner.ui.tryInvoke("abilityQuiet", {});
}

function playDefense(plan: Plan, difficulty: DifficultyId = "fulltime"): Outcome {
  const runner = beaconRunner("Town balance");
  setDifficulty(runner.ctx, difficulty);
  restartDefense(runner.ctx);
  const built = { next: 0 };
  runner.ui.invoke("wave.send", {});
  let spendIn = 0;
  // Bounty paid by the last shopping trip: anything paid after it arrived with no trip left to spend it.
  let bountyAtLastTrip = 0;
  let lastWave = 0;
  let distractedSeconds = 0;
  const trace: string[] = [];
  for (let t = 0; t < 2400 && !runEnded(keep.of(runner.ctx)); t += DT) {
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
    for (const tower of keep.of(runner.ctx).instances()) if (session.workers.has(tower.id, "distracted")) distractedSeconds += DT;
    spendIn -= DT;
    if (spendIn <= 0) {
      bountyAtLastTrip = keep.of(runner.ctx).num("keep.bounty_earned");
      spend(runner, plan, built);
      if (plan.rites === true) useRites(runner);
      spendIn = 1;
    }
  }
  const world = keep.of(runner.ctx);
  if (process.env.BEACON_TRACE) console.log(trace.join(" "), `end:t${Math.round(runner.ctx.time.now())}:L${world.num("keep.lives")}:held${world.fact("keep.held") === true}:creeps${session.creeps.size}:G${world.num("keep.gold")}:gate${world.num("keep.gold") - (world.num("keep.bounty_earned") - bountyAtLastTrip)}:distracted${Math.round(distractedSeconds)}s`);
  return {
    held: world.fact("keep.held") === true,
    wave: session.encounter.view().wave,
    lives: world.num("keep.lives"),
    gold: world.num("keep.gold") - (world.num("keep.bounty_earned") - bountyAtLastTrip),
    towers: world.instances().length,
  };
}

const MIXED: Plan = {
  builds: [
    "worker_barista",
    "worker_farmer",
    "worker_farmer",
    "worker_teacher",
    "worker_plumber",
    "worker_electrician",
    "worker_construction",
    "worker_librarian",
    "worker_barista",
    "worker_lawyer",
    "worker_firefighter",
  ],

  branch: {
    worker_barista: "espresso",
    worker_farmer: "harvest",
    worker_plumber: "burstmain",
    worker_teacher: "detention",
    worker_electrician: "breaker",
    worker_construction: "jackhammer",
    worker_librarian: "quiet",
    worker_firefighter: "ladder",
    worker_lawyer: "injunction",
  },
  upgrades: true,
  // The corners where the street doubles back first, then the side street's mouth, then the long legs.
  plots: ["plot-5", "plot-4", "plot-10", "plot-6", "plot-8", "plot-7", "plot-3", "plot-11", "plot-2", "plot-9", "plot-1"],
  rites: true,
};

/** Downtown's corners: the inside bends of the west road, the S-bend where both roads meet, then the north road. */
const DOWNTOWN_PLOTS = ["plot-3", "plot-7", "plot-2", "plot-6", "plot-11", "plot-9", "plot-8", "plot-4", "plot-13", "plot-1", "plot-10", "plot-12", "plot-5"];
/** Downtown's two extra north-road plots take a farmer for the surge's flyers and an electrician. */
const DOWNTOWN_CREW: Plan = { ...MIXED, builds: [...MIXED.builds, "worker_farmer", "worker_electrician"], plots: DOWNTOWN_PLOTS };

/** The School Campus's corners: where the school run meets the bus lane, then round the schoolyard. */
const SCHOOL_PLOTS = ["plot-5", "plot-7", "plot-8", "plot-6", "plot-3", "plot-4", "plot-2", "plot-11", "plot-9", "plot-10", "plot-1"];

/** Play `run` with the town switched to `map`, then switch back to Main Street. */
async function onMap<T>(map: MapId, run: () => T): Promise<T> {
  const { game } = await import("../game.config");
  game.scenes.build(map);
  try {
    return run();
  } finally {
    game.scenes.build("main-street");
  }
}

describe("pacing", () => {
  test("a town that hires nobody loses focus early", () => {
    const outcome = playDefense({ builds: [], branch: {}, upgrades: false });
    expect(outcome.held).toBe(false);
    expect(outcome.wave).toBeLessThanOrEqual(3);
  }, 60_000);

  test("a mixed, promoted crew holds Full-Time, losing some focus on the way and never sitting on a fortune", () => {
    const outcome = playDefense(MIXED);
    expect(outcome.held).toBe(true);
    expect(outcome.lives).toBeLessThan(20);
    expect(outcome.gold).toBeLessThan(300);
  }, 60_000);

  test("baristas alone can't reach the drones or The Cloud", () => {
    const outcome = playDefense({ ...MIXED, builds: Array(11).fill("worker_barista"), branch: { worker_barista: "pourover" } });
    expect(outcome.held).toBe(false);
  }, 60_000);

  test("answering distraction matters: the same crew with no Teacher or Librarian does worse", () => {
    const answered = playDefense(MIXED);
    const ignored = playDefense({
      ...MIXED,
      builds: MIXED.builds.map((kind) => (kind === "worker_teacher" || kind === "worker_librarian" ? "worker_barista" : kind)),
    });
    expect(ignored.wave * 100 + ignored.lives).toBeLessThan(answered.wave * 100 + answered.lives);
  }, 60_000);

  test("Downtown is clearly harder: the eleven workers that hold Main Street fall to its north-road surge; thirteen on its corners hold", async () => {
    const eleven = await onMap("downtown", () => playDefense({ ...MIXED, plots: DOWNTOWN_PLOTS }));
    const corners = await onMap("downtown", () => playDefense(DOWNTOWN_CREW));
    const inOrder = await onMap("downtown", () => playDefense({ ...DOWNTOWN_CREW, plots: undefined }));
    if (process.env.BEACON_TRACE) console.log("eleven", JSON.stringify(eleven), "thirteen", JSON.stringify(corners), "in order", JSON.stringify(inOrder));
    expect(playDefense(MIXED).held).toBe(true);
    expect(eleven.held).toBe(false);
    expect(corners.held).toBe(true);
    expect(inOrder.held).toBe(false);
  }, 240_000);

  test("School Campus: the same crew on its corners holds the toughest tech, with the recess bell's help", async () => {
    const corners = await onMap("school", () => playDefense({ ...MIXED, plots: SCHOOL_PLOTS }));
    if (process.env.BEACON_TRACE) console.log("school", JSON.stringify(corners));
    expect(corners.held).toBe(true);
  }, 120_000);

  test("Overtime is harder than Full-Time for the same crew", () => {
    const overtime = playDefense(MIXED, "overtime");
    const fulltime = playDefense(MIXED, "fulltime");
    expect(overtime.wave * 100 + overtime.lives).toBeLessThan(fulltime.wave * 100 + fulltime.lives);
  }, 60_000);
});
