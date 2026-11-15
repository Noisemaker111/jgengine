import { describe, expect, test } from "bun:test";
import type { HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { campaign, freshCampaign, setDifficulty, setRunModeChoice, type CampaignState, type DifficultyId } from "./campaign";
import { nextDistrict, seasonProgress } from "./season";
import { buyUnion, isHired, type TownUpgradeId } from "./union";
import { actionCost, gearCost, lotCost, nextLot, openPlots } from "./sinks";
import { FLANK_POINT_KEY, SPAWN_POINT_KEY } from "./world/path";
import type { RunMode } from "./waves/mode";
import { castAt } from "./combat/cast";
import { tickTowers } from "./combat/towerAI";
import { buildCost, keep, runEnded, towerOptions } from "./keep";
import { currentWaveNumber, session } from "./session";
import { beaconRunner } from "./testing";
import { tickWaves } from "./waves/director";
import { BUILD_PLOTS } from "./world/path";
import { MAP_IDS, MAPS, type MapId } from "../maps";
import { creepDef } from "./entities/enemies/catalog";
import { ENCOUNTER, encounterFor } from "./waves/manifest";
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
  /**
   * Whether the player spends the cash a full street piles up: spare lots (staffed with `extra`),
   * a Power Outage on a crowded road, Wi-Fi Off against routers, and gear on the crew.
   */
  sinks?: boolean;
  /** Workers for the spare lots, in order. */
  extra?: readonly string[];
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
/** The Overtime board the last played run left on its career. */
let lastBoard: { wave: number }[] = [];
/** The career the last played run left behind (its stars, districts and dues). */
let lastCareer: CampaignState | null = null;

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
  // Whether any promotion is still ahead: a crew saves for it before spending on gear or lots.
  let pending = false;
  for (const tower of world.instances()) {
    if (!tower.ready) continue;
    for (const option of towerOptions(world, tower.id, tower.kind)) {
      if (option.branch !== null && option.branch !== plan.branch[tower.kind]) continue;
      pending = true;
      if (option.refusal !== null) continue;
      const cost = -((option.cost["keep.gold"] as number | undefined) ?? 0);
      if (best === null || cost < best.cost) best = { id: tower.id, action: option.action, cost };
    }
  }
  if (best !== null) {
    runner.ui.tryInvoke("beacon.act", { action: best.action, target: best.id });
    return;
  }
  if (plan.sinks === true && !pending) spendSinks(runner, plan, built);
}

/** A full, promoted street's cash: lots first, then the town's actions where they bite, then gear. */
function spendSinks(runner: HeadlessRunner, plan: Plan, built: { next: number }): void {
  const world = keep.of(runner.ctx);
  const gold = () => world.num("keep.gold");
  const crowd = (route: string) => [...session.creeps.values()].filter((creep) => creep.route === route).length;
  const bossRoute = session.boss === null ? null : session.creeps.get(session.boss.instanceId)?.route ?? null;
  // The finale's boss, or a jammed road: cut its power.
  for (const route of [SPAWN_POINT_KEY, FLANK_POINT_KEY]) {
    if ((route === bossRoute || crowd(route) >= 14) && runner.ui.tryInvoke("town.buy", { action: "outage", route }).status === "applied") return;
  }
  if ([...session.creeps.values()].some((creep) => creep.catalogId === "tech_router") && runner.ui.tryInvoke("town.buy", { action: "wifi" }).status === "applied") return;
  // Late in the day, keep an outage in the till for the boss.
  const reserve = currentWaveNumber() >= 11 && bossRoute === null && !session.encounter.view().done ? actionCost("outage") : 0;
  const extra = plan.extra ?? ["worker_farmer", "worker_electrician", "worker_barista"];
  const spare = openPlots().find((plot) => plot.spare && world.occupant(plot.id) === null);
  if (spare !== undefined) {
    const kind = extra[Math.max(0, built.next - plan.builds.length) % extra.length]!;
    if (gold() - reserve >= buildCost(kind) && runner.ui.tryInvoke("beacon.place", { kind, slot: spare.id }).status === "applied") built.next += 1;
    return;
  }
  if (nextLot() !== null && gold() - reserve >= lotCost()) {
    runner.ui.tryInvoke("town.buy", { lot: true });
    return;
  }
  if (session.creeps.size === 0) return;
  for (const tower of world.instances()) {
    if (!tower.ready || gold() - reserve < gearCost(tower.kind)) continue;
    if (runner.ui.tryInvoke("town.buy", { gear: tower.id }).status === "applied") return;
  }
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

function playDefense(plan: Plan, difficulty: DifficultyId = "fulltime", mode: RunMode = "day", career?: CampaignState): Outcome {
  const runner = beaconRunner("Town balance");
  if (career !== undefined) campaign.write(runner.ctx, career);
  setDifficulty(runner.ctx, difficulty);
  setRunModeChoice(runner.ctx, mode);
  restartDefense(runner.ctx);
  const built = { next: 0 };
  runner.ui.invoke("wave.send", {});
  let spendIn = 0;
  // Bounty paid by the last shopping trip: anything paid after it arrived with no trip left to spend it.
  let bountyAtLastTrip = 0;
  let lastWave = 0;
  let distractedSeconds = 0;
  const trace: string[] = [];
  for (let t = 0; t < 4800 && !runEnded(keep.of(runner.ctx)); t += DT) {
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
  lastBoard = campaign.read(runner.ctx).overtime;
  lastCareer = campaign.read(runner.ctx);
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
  sinks: true,
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

  test("a mixed, promoted crew that spends its cash holds Full-Time with a few attention to spare and no fortune", () => {
    const outcome = playDefense(MIXED);
    if (process.env.BEACON_TRACE) console.log("main", JSON.stringify(outcome));
    expect(outcome.held).toBe(true);
    // A competent crew that spends its cash finishes with a few attention to spare, not on a knife edge.
    expect(outcome.lives).toBeGreaterThanOrEqual(3);
    expect(outcome.lives).toBeLessThanOrEqual(10);
    expect(outcome.gold).toBeLessThan(300);
  }, 60_000);

  test("baristas alone can't reach the drones or The Cloud", () => {
    const outcome = playDefense({ ...MIXED, builds: Array(11).fill("worker_barista"), branch: { worker_barista: "pourover" } });
    expect(outcome.held).toBe(false);
  }, 60_000);

  test("answering distraction matters: the same crew with no Teacher or Librarian does worse", () => {
    const answered = playDefense({ ...MIXED, sinks: false });
    const ignored = playDefense({
      ...MIXED, sinks: false,
      builds: MIXED.builds.map((kind) => (kind === "worker_teacher" || kind === "worker_librarian" ? "worker_barista" : kind)),
    });
    if (process.env.BEACON_TRACE) console.log("answered", JSON.stringify(answered), "ignored", JSON.stringify(ignored));
    expect(ignored.wave * 100 + ignored.lives).toBeLessThan(answered.wave * 100 + answered.lives);
  }, 60_000);

  test("Downtown is clearly harder: its surge fields far more tech, thirteen on its corners hold with focus to spare, careless placement falls", async () => {
    const weight = (definition: { waves: readonly { groups: readonly { unit: string; count?: number }[] }[] }) =>
      definition.waves.reduce((sum, wave) => sum + wave.groups.reduce((acc, group) => acc + creepDef(group.unit).health * (group.count ?? 1), 0), 0);
    expect(weight(encounterFor(MAPS.downtown.surge))).toBeGreaterThan(weight(ENCOUNTER) * 1.25);
    const corners = await onMap("downtown", () => playDefense(DOWNTOWN_CREW));
    const inOrder = await onMap("downtown", () => playDefense({ ...DOWNTOWN_CREW, plots: undefined }));
    if (process.env.BEACON_TRACE) console.log("downtown", JSON.stringify(corners), "in order", JSON.stringify(inOrder));
    expect(corners.held).toBe(true);
    expect(corners.lives).toBeGreaterThanOrEqual(1);
    expect(corners.lives).toBeLessThanOrEqual(10);
    expect(inOrder.held).toBe(false);
  }, 240_000);

  test("School Campus: the same crew on its corners holds the toughest tech, with the recess bell's help", async () => {
    const corners = await onMap("school", () => playDefense({ ...MIXED, plots: SCHOOL_PLOTS }));
    if (process.env.BEACON_TRACE) console.log("school", JSON.stringify(corners));
    expect(corners.held).toBe(true);
    expect(corners.lives).toBeGreaterThanOrEqual(1);
    expect(corners.lives).toBeLessThanOrEqual(12);
  }, 120_000);

  test("Overtime (endless): the crew works past the day's twelve waves, falls in a later era, and the night goes on the board", () => {
    const night = playDefense(MIXED, "fulltime", "overtime");
    if (process.env.BEACON_TRACE) console.log("overtime", JSON.stringify(night));
    expect(night.held).toBe(false);
    expect(night.wave).toBeGreaterThan(12);
    expect(night.wave).toBeLessThan(40);
    // Late cash goes somewhere: spare lots staffed, gear and outages bought, not a hoard.
    expect(night.towers).toBeGreaterThan(11);
    expect(night.gold).toBeLessThan(1500);
    expect(lastBoard[0]?.wave).toBe(night.wave);
  }, 180_000);

  test("Double Shift is harder than Full-Time for the same crew", () => {
    const overtime = playDefense(MIXED, "overtime");
    const fulltime = playDefense(MIXED, "fulltime");
    expect(overtime.wave * 100 + overtime.lives).toBeLessThan(fulltime.wave * 100 + fulltime.lives);
  }, 60_000);
});

/** What a sensible manager buys in the union hall, in order, whenever the dues cover it. */
const HALL_WISHLIST: readonly ({ hire: string } | { train: string } | { town: TownUpgradeId })[] = [
  { hire: "worker_grandma" },
  { hire: "worker_electrician" },
  { hire: "worker_librarian" },
  { hire: "worker_construction" },
  { town: "landlines" },
  { hire: "worker_firefighter" },
  { hire: "worker_lawyer" },
  { train: "worker_farmer" },
  { train: "worker_barista" },
  { town: "block_party" },
  { train: "worker_electrician" },
  { train: "worker_farmer" },
  { town: "library_card" },
  { train: "worker_barista" },
];

/** Spend the career's dues down the wish list, as far as they go. */
function shopHall(career: CampaignState): CampaignState {
  const runner = beaconRunner("Union hall");
  campaign.write(runner.ctx, career);
  for (const offer of HALL_WISHLIST) buyUnion(runner.ctx, offer);
  return campaign.read(runner.ctx);
}

/** The day's crew: the mixed crew, each trade the union lacks swapped for a starter that covers its job. */
function careerPlan(career: CampaignState, map: MapId): Plan {
  const stand: Record<string, string> = { worker_electrician: "worker_plumber", worker_construction: "worker_barista", worker_librarian: "worker_teacher", worker_lawyer: "worker_farmer", worker_firefighter: "worker_plumber" };
  const base = map === "downtown" ? DOWNTOWN_CREW : map === "school" ? { ...MIXED, plots: SCHOOL_PLOTS } : MIXED;
  return { ...base, builds: base.builds.map((kind) => (isHired(career, kind) ? kind : (stand[kind] ?? "worker_barista"))) };
}

describe("the campaign curve", () => {
  test("a career from zero: some days are lost on the way, dues fill the union, and the season is kept in under two weeks", async () => {
    let career = freshCampaign();
    let map: MapId = "main-street";
    const log: string[] = [];
    let firstDay: Outcome | null = null;
    for (let day = 1; day <= 14 && seasonProgress(career).held < MAP_IDS.length; day += 1) {
      const plan = careerPlan(career, map);
      const outcome = await onMap(map, () => playDefense(plan, "fulltime", "day", career));
      firstDay ??= outcome;
      career = shopHall(lastCareer!);
      log.push(`d${day}:${map}:${outcome.held ? "held" : "lost"}@${outcome.wave}:L${outcome.lives}:hired${MAP_IDS.length > 0 ? career.union.hired.length : 0}:dues${career.union.dues}`);
      map = nextDistrict(career, map) ?? map;
    }
    if (process.env.BEACON_TRACE) console.log(log.join(" "));
    expect(firstDay).not.toBeNull();
    expect(log.some((entry) => entry.includes(":lost@"))).toBe(true);
    expect(seasonProgress(career).held).toBe(MAP_IDS.length);
    expect(log.length).toBeLessThanOrEqual(14);
    expect(log.length).toBeGreaterThanOrEqual(4);
  }, 900_000);
});
