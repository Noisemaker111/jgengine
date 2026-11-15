import { describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";

import { DAY_LENGTH } from "../world";
import { game } from "../game.config";
import { householdBook } from "./agents";
import { rungProgress } from "./careers";
import { registerCommands } from "./commands";
import { content } from "./content";
import { FURNITURE_BY_ID } from "./objects/catalog";
import { householdStore } from "./session/store";
import type { HouseholdState } from "./session/types";
import { charterGrade, charterOf, TERM_DAYS, TERMS } from "./sim/charter";
import { incidentDef, repairCost } from "./sim/events";
import { setupWorld } from "./sim/setup";
import { boardingOf, moduleBlocker, moveTenant, nextModulePrice, roomOf, tenantComfort, tuneCost, vacantRooms } from "./boarding/boarding";
import { ROOM_SLOTS } from "./boarding/rooms";
import { simulateHousehold } from "./sim/simulate";

/**
 * A balance bot: plays whole charters headless and reports how each kind of player fares. An
 * absent player and one who only keeps the pantry stocked both lose the habitat; a steward who
 * promotes, furnishes, answers transmissions and mends what breaks keeps the charter, but not with
 * every goal met.
 */

type Policy = "absent" | "caretaker" | "steward";

interface RunSummary {
  outcome: string;
  /** Day (1-based) the run ended on: eviction day, or the charter's last. */
  day: number;
  stars: number;
  strikes: number;
  minCredits: number;
  maxDebt: number;
  incidents: number;
  answered: number;
  finalCredits: number;
  /** Goals met per closed term. */
  perTerm: number[];
}

function boot(): GameContext {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "orbit-balance-bot", isNew: true } });
  setupWorld(ctx);
  registerCommands(ctx);
  ctx.game.commands.define("orbit.checkpoint", { apply() {} });
  setGamePhase(ctx, "playing");
  return ctx;
}

const SPOTS: [number, number][] = [];
for (let x = -16; x <= 16; x += 4) for (let z = -16; z <= 16; z += 4) SPOTS.push([x, z]);

function furnish(ctx: GameContext, toolId: string): boolean {
  const before = householdStore.read(ctx).credits;
  for (const [x, z] of SPOTS) {
    ctx.game.commands.run("build.tool", { toolId });
    ctx.game.commands.run("world.pointer", { point: { x, y: 0, z }, entity: null, object: null });
    if (householdStore.read(ctx).credits < before) return true;
  }
  ctx.game.commands.run("build.cancel", {});
  return false;
}

/** Rank the choices a careful player prefers, then take the first one the household can afford. */
const PREFERENCE: Record<string, readonly string[]> = {
  trader: ["haggle", "buy", "decline"],
  festival: ["host", "lanterns", "skip"],
  meteorShower: ["shutters", "watch"],
  flare: ["shutters", "ride"],
  eggs: ["keep"],
  molt: ["handy", "clean", "leave"],
  overtime: ["decline"],
  dust: ["seal", "endure"],
  brownout: ["cells", "dark"],
  spoilage: ["spot", "stasis", "toss"],
  traveller: ["share", "refuse"],
  quarrel: ["meal", "cool"],
  fever: ["medicine", "rest"],
  meteor: ["handy", "repair", "leave"],
  hullLeak: ["handy", "patch", "leave"],
};

function answer(ctx: GameContext, state: HouseholdState): void {
  const pending = state.incident;
  if (pending == null) return;
  const def = incidentDef(pending.id);
  if (def?.choices === undefined) return;
  for (const choice of PREFERENCE[pending.id] ?? def.choices.map((c) => c.id)) {
    const option = def.choices.find((c) => c.id === choice);
    if (option === undefined || option.blocked?.(state, pending) != null) continue;
    if (pending.id === "trader" && state.pantry > 20) { ctx.game.commands.run("incident.answer", { choice: "decline" }); return; }
    ctx.game.commands.run("incident.answer", { choice });
    return;
  }
}

function count(ctx: GameContext, catalogId: string): number {
  return ctx.scene.object.list().filter((o) => o.catalogId === catalogId).length;
}

/** Total comfort of everyone with a room: what a landlord shuffling key-tags tries to raise. */
function houseComfort(state: HouseholdState): number {
  return state.order.reduce((sum, id) => sum + (roomOf(state, id) === null ? 0 : tenantComfort(state, id).score), 0);
}

/**
 * The landlord's half of a careful player: interview and let in whoever buzzes while a room is free,
 * try every swap and keep the ones that raise the house's comfort, retune and seal rooms when the
 * jar allows, dock a module when the station agrees, and give Pip-9 the next free door.
 */
function landlord(ctx: GameContext, reserve: number): void {
  let state = householdStore.read(ctx);
  const boarding = boardingOf(state);
  if (boarding.applicant !== null && vacantRooms(state).length > 0) {
    for (const question of [0, 1, 2]) ctx.game.commands.run("applicant.ask", { question });
    ctx.game.commands.run("applicant.accept", { slot: vacantRooms(state)[0]!.slot });
  }
  state = householdStore.read(ctx);
  const pip = state.order.find((id) => roomOf(state, id) === null);
  if (pip !== undefined && boardingOf(state).applicant === null && vacantRooms(state).length > 0 && Math.floor(ctx.time.now()) % 30 === 0) {
    ctx.game.commands.run("room.move", { id: pip, slot: vacantRooms(state)[0]!.slot });
  }
  const hour = Math.floor(((ctx.time.now() % DAY_LENGTH) / DAY_LENGTH) * 24 * 2);
  if (Math.floor(((ctx.time.now() - 0.5) % DAY_LENGTH) / DAY_LENGTH * 24 * 2) === hour) return;
  state = householdStore.read(ctx);
  const housed = state.order.filter((id) => roomOf(state, id) !== null);
  for (const a of housed) for (const b of housed) {
    if (a >= b) continue;
    const trial = structuredClone(state);
    const target = roomOf(trial, b)!.slot;
    if (moveTenant(trial, a, target) !== null) continue;
    if (houseComfort(trial) > houseComfort(householdStore.read(ctx)) + 8) ctx.game.commands.run("room.move", { id: a, slot: target });
  }
  for (const room of boardingOf(householdStore.read(ctx)).rooms) {
    const s = householdStore.read(ctx);
    if (room.tenantId === null) continue;
    const comfort = tenantComfort(s, room.tenantId);
    const cost = tuneCost(s, room.slot);
    if (comfort.score < 80 && cost > 0 && s.credits >= cost + reserve) ctx.game.commands.run("room.tune", { slot: room.slot });
    if (comfort.reasons.some((r) => r.factor === "leak") && !room.sealed && householdStore.read(ctx).credits >= 60 + reserve) ctx.game.commands.run("room.seal", { slot: room.slot });
  }
  state = householdStore.read(ctx);
  const { price } = nextModulePrice(state);
  for (let slot = 0; slot < ROOM_SLOTS; slot++) {
    if (moduleBlocker(state, slot) === null && state.credits >= price + reserve * 2) { ctx.game.commands.run("room.buy", { slot }); break; }
  }
}

function steward(ctx: GameContext): void {
  let state = householdStore.read(ctx);
  answer(ctx, state);
  landlord(ctx, 140 + charterOf(state).term * 60);
  state = householdStore.read(ctx);
  if (state.pantry <= 8 && state.credits >= 36 + 60) ctx.game.commands.run("household.rations", {});
  for (const id of state.order) {
    const member = householdStore.read(ctx).members[id]!;
    if (rungProgress(householdStore.read(ctx), member).canPromote) ctx.game.commands.run("member.promote", { id });
  }
  state = householdStore.read(ctx);
  for (const objId of state.hazards?.broken ?? []) {
    const obj = ctx.scene.object.get(objId);
    if (obj !== null && state.credits >= repairCost(obj.catalogId) + 150) ctx.game.commands.run("household.repair", { id: objId });
  }
  state = householdStore.read(ctx);
  if (state.hazards?.hullLeak && state.credits >= 70 + 200) ctx.game.commands.run("household.patchHull", {});
  const term = charterOf(state).term;
  const furnishings = ctx.scene.object.list().filter((o) => FURNITURE_BY_ID[o.catalogId] !== undefined).length;
  const reserve = 140 + term * 60;
  state = householdStore.read(ctx);
  if (count(ctx, "work_console") < 2 && state.credits >= 220 + reserve) furnish(ctx, "work_console");
  else if (term >= 1 && furnishings < 10 && state.credits >= 160 + reserve * 1.5) {
    const want = count(ctx, "nutrient_font") < 2 ? "nutrient_font" : count(ctx, "sleep_pod") < 2 ? "sleep_pod" : count(ctx, "bloom_planter") < 2 ? "bloom_planter" : "holo_arcade";
    furnish(ctx, want);
  }
  const hour = ((ctx.time.now() % DAY_LENGTH) / DAY_LENGTH) * 24;
  if (hour >= 18.5 && hour < 18.6) {
    const s = householdStore.read(ctx);
    const book = householdBook(s);
    let best: [string, string] | null = null;
    let top = -Infinity;
    for (const a of s.order) for (const b of s.order) if (a < b && book.opinion(a, b) > top) { top = book.opinion(a, b); best = [a, b]; }
    if (best !== null) ctx.game.commands.run("member.socialize", { id: best[0], withId: best[1] });
  }
}

function runCharter(policy: Policy): RunSummary {
  const ctx = boot();
  const end = DAY_LENGTH * (TERM_DAYS * TERMS.length) + DAY_LENGTH * (9 / 24) + 1;
  let minCredits = Infinity;
  let maxDebt = 0;
  let incidents = 0;
  let seq = -1;
  ctx.game.notices.onPush((n) => { if (n.text.startsWith("Front desk:")) incidents += 1; });
  let answered = 0;
  while (ctx.time.now() < end) {
    // Every player reads the term letter: it holds a waiting transmission's clock until dismissed.
    if (charterOf(householdStore.read(ctx)).review !== null) ctx.game.commands.run("charter.dismiss", {});
    const before = householdStore.read(ctx);
    if (policy === "caretaker" && before.pantry <= 4 && before.credits >= 36) ctx.game.commands.run("household.rations", {});
    if (policy === "steward") {
      const pending = before.incident?.id ?? null;
      steward(ctx);
      if (pending !== null && householdStore.read(ctx).incident == null) answered += 1;
    }
    simulateHousehold(ctx, ctx.time.advance(0.5));
    const state = householdStore.read(ctx);
    if (state.eventSeq !== seq) { seq = state.eventSeq; }
    minCredits = Math.min(minCredits, state.credits);
    maxDebt = Math.max(maxDebt, state.debt);
    if (charterOf(state).outcome === "evicted") break;
  }
  const state = householdStore.read(ctx);
  const charter = charterOf(state);
  return {
    outcome: charter.outcome, day: state.day + 1, stars: charterGrade(charter).stars, strikes: charter.strikes,
    minCredits: Math.round(minCredits), maxDebt: Math.round(maxDebt), incidents, answered,
    finalCredits: Math.round(state.credits), perTerm: charter.stars,
  };
}

describe("balance bot: whole charters", () => {
  const runs: Partial<Record<Policy, RunSummary>> = {};
  const run = (policy: Policy) => (runs[policy] ??= runCharter(policy));

  test("an absent household is evicted before the charter ends", () => {
    const summary = run("absent");
    console.log("absent", JSON.stringify(summary));
    expect(summary.outcome).toBe("evicted");
    expect(summary.day).toBeLessThanOrEqual(TERM_DAYS * 3 + 1);
  }, 120_000);

  test("keeping the pantry stocked is not enough on its own", () => {
    const summary = run("caretaker");
    console.log("caretaker", JSON.stringify(summary));
    expect(summary.outcome).toBe("evicted");
  }, 120_000);

  test("a steward keeps the charter, but the later terms bite", () => {
    const summary = run("steward");
    console.log("steward", JSON.stringify(summary));
    expect(summary.outcome).toBe("kept");
    expect(summary.strikes).toBeLessThanOrEqual(1);
    expect(summary.stars).toBeGreaterThanOrEqual(7);
    expect(summary.stars).toBeLessThan(12);
    expect(summary.incidents).toBeGreaterThanOrEqual(15);
    expect(summary.answered).toBeGreaterThanOrEqual(10);
  }, 180_000);
});
