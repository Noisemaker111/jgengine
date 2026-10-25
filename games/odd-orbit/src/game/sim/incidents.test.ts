import { describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";

import { DAY_LENGTH } from "../../world";
import { game } from "../../game.config";
import { memberAgent } from "../agents";
import { registerCommands } from "../commands";
import { content } from "../content";
import { householdStore } from "../session/store";
import { createHousehold, type PendingIncident } from "../session/types";
import { rollTraits, TRAITS, TRAIT_IDS, decayFactor } from "../traits";
import { BAILIFF_DEBT, GRANT_PER_GOAL, reviewCharter, TERM_DAYS, termGoals } from "./charter";
import { nextBill, TERM_RENT } from "./economy";
import { answerIncident, incidentDef, INCIDENTS } from "./events";
import { setupWorld } from "./setup";
import { simulateHousehold } from "./simulate";

function boot(): GameContext {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "orbit-incident-test", isNew: true } });
  setupWorld(ctx);
  registerCommands(ctx);
  ctx.game.commands.define("orbit.checkpoint", { apply() {} });
  setGamePhase(ctx, "playing");
  return ctx;
}

const quiet = { push() {} };

describe("transmissions", () => {
  test("a slow frame and a fast one draw the same transmissions at the same game second", () => {
    const logs = [2.5, 1 / 30].map((frame) => {
      const ctx = boot();
      const log: string[] = [];
      ctx.game.notices.onPush((n) => { if (n.text.startsWith("Transmission:")) log.push(`${Math.floor(householdStore.read(ctx).story!.elapsed)} ${n.text.split(".")[0]}`); });
      while (ctx.time.now() < DAY_LENGTH * 3) simulateHousehold(ctx, ctx.time.advance(frame));
      return log;
    });
    expect(logs[0]!.length).toBeGreaterThanOrEqual(2);
    expect(logs[1]).toEqual(logs[0]!);
  }, 60_000);

  test("every incident with choices names a default the household can always take", () => {
    const state = createHousehold("x");
    state.credits = 0;
    state.pantry = 0;
    for (const def of INCIDENTS) {
      if (def.choices === undefined) continue;
      const fallback = def.choices.find((c) => c.id === def.fallback);
      expect(fallback).toBeDefined();
      const pending: PendingIncident = { id: def.id, memberId: null, otherId: null, objId: null, objCatalog: null, deadline: 0 };
      expect(fallback!.blocked?.(state, pending) ?? null).toBeNull();
    }
  });

  test("an answer the household cannot afford is refused; a chosen answer counts toward the charter", () => {
    const ctx = boot();
    const state = householdStore.read(ctx);
    state.incident = { id: "brownout", memberId: null, otherId: null, objId: null, objCatalog: null, deadline: ctx.time.now() + 45 };
    state.credits = 20;
    expect(answerIncident(state, "cells", ctx.time.now(), quiet)).toBe(false);
    expect(state.incident).not.toBeNull();
    state.credits = 100;
    expect(answerIncident(state, "cells", ctx.time.now(), quiet)).toBe(true);
    expect(state.credits).toBe(55);
    expect(state.charter!.answered).toBe(1);
    state.incident = { id: "brownout", memberId: null, otherId: null, objId: null, objCatalog: null, deadline: ctx.time.now() };
    expect(answerIncident(state, null, ctx.time.now(), quiet)).toBe(true);
    expect(state.charter!.answered).toBe(1);
    expect(state.hazards!.consolesOfflineUntil).toBeGreaterThan(ctx.time.now());
  });

  test("a meteor puts a furnishing out of service until it is mended", () => {
    const ctx = boot();
    const state = householdStore.read(ctx);
    const meteor = incidentDef("meteor")!;
    const objects = ctx.scene.object.list();
    const pick = meteor.pick!(state, objects, () => 0)!;
    expect(state.hazards!.broken).toEqual([pick.objId!]);
    householdStore.write(ctx, { ...state });
    simulateHousehold(ctx, ctx.time.advance(1));
    const after = householdStore.read(ctx);
    for (const id of after.order) {
      const action = after.members[id]!.action;
      if (action.kind === "use" || action.kind === "seek") expect(action.objId).not.toBe(pick.objId);
    }
    after.credits = 1000;
    householdStore.write(ctx, { ...after });
    ctx.game.commands.run("household.repair", { id: pick.objId });
    expect(householdStore.read(ctx).hazards!.broken).toEqual([]);
    expect(householdStore.read(ctx).credits).toBeLessThan(1000);
  });
});

describe("the charter", () => {
  test("rent rises with each term and the bill shows it", () => {
    const ctx = boot();
    const state = householdStore.read(ctx);
    const objects = ctx.scene.object.list();
    const first = nextBill(state, objects);
    state.charter!.term = 3;
    expect(nextBill(state, objects) - first).toBe(TERM_RENT[3] - TERM_RENT[0]);
  });

  test("a term closing with fewer than two goals is a strike, and the second strike evicts", () => {
    const ctx = boot();
    const state = householdStore.read(ctx);
    const objects = ctx.scene.object.list();
    state.debt = 10;
    state.day = TERM_DAYS;
    reviewCharter(state, objects, 0, quiet);
    expect(state.charter!.term).toBe(1);
    expect(state.charter!.strikes).toBe(1);
    expect(state.charter!.review?.strike).toBe(true);
    state.day = TERM_DAYS * 2;
    reviewCharter(state, objects, 0, quiet);
    expect(state.charter!.outcome).toBe("evicted");
  });

  test("goals met pay a grant each", () => {
    const ctx = boot();
    const state = householdStore.read(ctx);
    const objects = ctx.scene.object.list();
    const before = state.credits;
    state.day = TERM_DAYS;
    const met = termGoals(state, objects).met;
    reviewCharter(state, objects, 0, quiet);
    expect(state.credits).toBe(before + met * GRANT_PER_GOAL);
  });

  test("debt past the bailiff line evicts at once", () => {
    const ctx = boot();
    const state = householdStore.read(ctx);
    state.debt = BAILIFF_DEBT;
    reviewCharter(state, ctx.scene.object.list(), 0, quiet);
    expect(state.charter!.outcome).toBe("evicted");
    expect(state.charter!.review?.reason).toContain(String(BAILIFF_DEBT));
  });
});

describe("traits", () => {
  test("every being rolls two traits that can sit together, the same way for the same seed", () => {
    for (let i = 0; i < 200; i++) {
      const traits = rollTraits(`seed-${i}`);
      expect(traits).toHaveLength(2);
      expect(new Set(traits).size).toBe(2);
      expect(TRAITS[traits[0]!].excludes ?? []).not.toContain(traits[1]);
      expect(TRAITS[traits[1]!].excludes ?? []).not.toContain(traits[0]);
      expect(rollTraits(`seed-${i}`)).toEqual(traits);
    }
    const seen = new Set(Array.from({ length: 200 }, (_, i) => rollTraits(`seed-${i}`)).flat());
    expect(seen.size).toBe(TRAIT_IDS.length);
  });

  test("a hearty eater's hunger drains faster than a neighbour's", () => {
    const ctx = boot();
    const state = householdStore.read(ctx);
    const [a, b] = [state.members[state.order[0]!]!, state.members[state.order[1]!]!];
    a.bodyPlan = { ...b.bodyPlan };
    a.traits = ["hearty", "kind"];
    b.traits = ["handy", "kind"];
    expect(decayFactor(a, "hunger")).toBeCloseTo(1.3);
    const agents = [memberAgent(a, () => 0.5), memberAgent(b, () => 0.5)];
    for (const agent of agents) agent.update({ dt: 30, now: 30 });
    expect(agents[0]!.needs.value("hunger")).toBeLessThan(agents[1]!.needs.value("hunger"));
  });
});
