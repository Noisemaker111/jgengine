import { describe, expect, test } from "bun:test";
import { createLootPipeline } from "../game/lootPipeline";
import { timeScaledRarity } from "../game/lootModifiers";
import { defineGameDefinition } from "../game/defineGame";
import { defineSystem } from "../game/defineSystem";
import { createGameContext } from "../runtime/gameContext";
import { defineStore } from "../store/defineStore";
import { dispatchExpedition, recallExpedition, returnExpeditionNow, settleExpedition, type ExpeditionConfig, type ExpeditionState } from "./expedition";

type LootContext = { elapsedMs: number };
const HOUR = 3_600_000;
function config(overrides: Partial<ExpeditionConfig<LootContext>> = {}): ExpeditionConfig<LootContext> {
  return { tickMs: HOUR, loot: createLootPipeline({ id: "scout-rewards", stages: [{ id: "survey", table: { id: "survey-pool", entries: [
    { item: "sample", count: [1, 2], weight: 3 }, { item: "artifact", count: 1, weight: 1 },
  ] }, modifiers: [timeScaledRarity({ id: "survey-depth", ramp: (entry, hours) => entry.item === "artifact" ? 1 + hours : 1 })] }] }),
    lootCtx: state => ({ elapsedMs: state.elapsedMs }), maxHp: () => 100, returnFraction: 0.5, carryCap: 1000,
    describe: event => `Survey ${event.kind}`, ...overrides };
}
function dispatch(overrides: Partial<Parameters<typeof dispatchExpedition>[0]> = {}): ExpeditionState {
  return dispatchExpedition({ id: "scout-1", startAtMs: 1_700_000_000_000, hp: 100, seed: "survey-campaign", ...overrides });
}

describe("expedition settlement", () => {
  test("multi-day catch-up matches tick-by-tick log, loot, hazard RNG and frontier exactly", () => {
    const cfg = config({ hazard: (_state, rng) => ({ damage: rng() < 0.5 ? 0.25 : 0.5, notices: [{ kind: "location", text: "Caller-authored survey encounter" }] }), logLimit: 40 });
    const initial = dispatch();
    let online = initial;
    for (let tick = 1; tick <= 72; tick += 1) online = settleExpedition(cfg, online, initial.startedAtMs + tick * HOUR);
    const offline = settleExpedition(cfg, initial, initial.startedAtMs + 72 * HOUR);
    expect(offline).toEqual(online);
    expect(offline.elapsedMs).toBe(72 * HOUR);
    expect(offline.log.length).toBe(40);
    expect(offline.carried.reduce((total, drop) => total + drop.count, 0)).toBeGreaterThanOrEqual(72);
    expect(offline.cursor).not.toBe(initial.cursor);
    expect(settleExpedition(cfg, offline, initial.startedAtMs + 72 * HOUR)).toBe(offline);
    expect(initial.log).toEqual([]); expect(initial.carried).toEqual([]);
    expect(offline.log.some(event => event.text === "Caller-authored survey encounter")).toBe(true);
  });

  test("partial intervals, backward clocks and cold JSON RNG resume preserve future rewards", () => {
    const cfg = config(); const initial = dispatch();
    const partial = settleExpedition(cfg, initial, initial.startedAtMs + 1.5 * HOUR);
    expect(partial.lastSettledMs).toBe(initial.startedAtMs + HOUR);
    expect(partial.elapsedMs).toBe(1.5 * HOUR);
    expect(settleExpedition(cfg, partial, initial.startedAtMs)).toBe(partial);
    expect(recallExpedition(cfg, partial, initial.startedAtMs + 1.25 * HOUR)).toBe(partial);
    expect(returnExpeditionNow(cfg, partial, initial.startedAtMs + 1.25 * HOUR)).toBe(partial);
    const cold = JSON.parse(JSON.stringify(partial)) as ExpeditionState;
    const warmResult = settleExpedition(cfg, partial, initial.startedAtMs + 48 * HOUR);
    expect(settleExpedition(config(), cold, initial.startedAtMs + 48 * HOUR)).toEqual(warmResult);
    expect(settleExpedition(config(), dispatch(), initial.startedAtMs + 48 * HOUR)).toEqual(warmResult);
    expect(settleExpedition(cfg, dispatch({ seed: "different-campaign" }), initial.startedAtMs + 48 * HOUR).carried).not.toEqual(warmResult.carried);
  });

  test("whole millisecond event boundaries preserve catch-up equivalence", () => {
    const initial = dispatch(); const cfg = config({ tickMs: 1, logLimit: 1000 });
    let online = initial;
    for (let tick = 1; tick <= 43; tick += 1) online = settleExpedition(cfg, online, initial.startedAtMs + tick);
    const offline = settleExpedition(cfg, initial, initial.startedAtMs + 43);
    expect(offline.lastSettledMs).toBe(initial.startedAtMs + 43);
    expect(offline.log.filter(event => event.kind === "loot").length).toBe(43);
    expect(offline).toEqual(online);
  });

  test("multi-day settlement and incremental calls also agree after death or automatic return", () => {
    const initial = dispatch(); const target = initial.startedAtMs + 72 * HOUR;
    for (const cfg of [
      config({ hazard: () => ({ damage: 60 }), supplies: [{ key: "heal", when: state => state.hp < 50, restoreHp: 30 }] }),
      config({ carryCap: 2 }),
    ]) {
      let online = initial;
      for (let tick = 1; tick <= 72; tick += 1) online = settleExpedition(cfg, online, initial.startedAtMs + tick * HOUR);
      expect(settleExpedition(cfg, initial, target)).toEqual(online);
      expect(["dead", "home"]).toContain(online.status);
    }
  });

  test("finite supplies auto-consume in declared order and exhaustion ends in death", () => {
    const supplies = { medicine: 2, filter: 1 };
    const initial = dispatch({ hp: 10, supplies });
    const cfg = config({ maxHp: state => Math.max(1, 10 - state.exposure), hazard: () => ({ damage: 4, exposure: 2 }), supplies: [
      { key: "filter", when: state => state.exposure >= 2, clearExposure: 2 },
      { key: "medicine", when: state => state.hp <= 6, restoreHp: 4 },
    ] });
    const result = settleExpedition(cfg, initial, initial.startedAtMs + 24 * HOUR);
    expect(result.status).toBe("dead"); expect(result.hp).toBe(0);
    expect(result.supplies).toEqual({ medicine: 0, filter: 0 });
    expect(result.lastSettledMs).toBe(initial.startedAtMs + 4 * HOUR);
    expect(result.log.filter(event => event.kind === "supply").map(event => event.supply)).toEqual(["filter", "medicine", "medicine"]);
    expect(result.log.at(-1)?.kind).toBe("death");
    expect(recallExpedition(cfg, result, initial.startedAtMs + 30 * HOUR)).toBe(result);
    expect(returnExpeditionNow(cfg, result, initial.startedAtMs + 30 * HOUR)).toBe(result);
    expect(supplies).toEqual({ medicine: 2, filter: 1 });
  });

  test("unowned supply keys and ineffective restoration cannot spend inventory", () => {
    const initial = dispatch({ supplies: { medicine: 2 } });
    const next = settleExpedition(config({ supplies: [
      { key: "toString", when: () => true, restoreHp: 5 },
      { key: "medicine", when: () => true, restoreHp: 5 },
    ] }), initial, initial.startedAtMs + HOUR);
    expect(next.supplies).toEqual({ medicine: 2 });
    expect(next.log.filter(event => event.kind === "supply")).toEqual([]);
  });

  test("recall settles exploring ticks first, then returns after the exact elapsed fraction without damage", () => {
    const cfg = config({ hazard: () => ({ damage: 1 }) }); const initial = dispatch();
    const recalled = recallExpedition(cfg, initial, initial.startedAtMs + 3.5 * HOUR);
    expect(recalled.status).toBe("returning"); expect(recalled.hp).toBe(97);
    expect(recalled.elapsedMs).toBe(3.5 * HOUR);
    expect(recalled.returnUntilMs).toBe(initial.startedAtMs + 5.25 * HOUR);
    const traveling = settleExpedition(cfg, recalled, initial.startedAtMs + 5 * HOUR);
    expect(traveling).toBe(recalled);
    const home = settleExpedition(cfg, recalled, initial.startedAtMs + 10 * HOUR);
    expect(home.status).toBe("home"); expect(home.hp).toBe(97); expect(home.carried).toEqual(recalled.carried);
    expect(home.lastSettledMs).toBe(recalled.returnUntilMs!); expect(home.log.at(-1)?.at).toBe(recalled.returnUntilMs!);
    expect(settleExpedition(cfg, home, initial.startedAtMs + 20 * HOUR)).toBe(home);
  });

  test("capacity admits item units in order, preserves currency and full rolled provenance, and recalls at the event time", () => {
    const cfg = config({ carryCap: 4, loot: createLootPipeline({ id: "cargo", stages: [{ id: "ore", table: { id: "ore-table", entries: [{ item: "ore", count: 3, weight: 1 }] } }, { id: "pay", table: { id: "pay-table", entries: [{ currency: "credits", count: 100, weight: 1 }] } }] }) });
    const initial = dispatch(); const recalled = settleExpedition(cfg, initial, initial.startedAtMs + 2.5 * HOUR);
    expect(recalled.status).toBe("returning"); expect(recalled.returnUntilMs).toBe(initial.startedAtMs + 3 * HOUR);
    expect(recalled.carried).toEqual([{ item: "ore", count: 4 }, { currency: "credits", count: 200 }]);
    const secondRoll = recalled.log.filter(event => event.kind === "loot")[1]!;
    expect(secondRoll.drops).toEqual([{ item: "ore", count: 1 }, { currency: "credits", count: 100 }]);
    expect(secondRoll.loot?.drops).toEqual([{ item: "ore", count: 3 }, { currency: "credits", count: 100 }]);
    expect(secondRoll.loot?.provenance[0]?.tableId).toBe("ore-table");
    const offlineHome = settleExpedition(cfg, initial, initial.startedAtMs + 24 * HOUR);
    expect(offlineHome.status).toBe("home"); expect(offlineHome.carried).toEqual(recalled.carried);
    expect(offlineHome.log.filter(event => event.kind === "loot").length).toBe(2);
    expect(offlineHome.log.at(-1)?.at).toBe(initial.startedAtMs + 3 * HOUR);
  });

  test("bounded backlog is retained and recall/instant return cannot skip it", () => {
    const cfg = config({ maxTicksPerSettle: 2 }); const initial = dispatch(); const target = initial.startedAtMs + 5 * HOUR;
    const first = recallExpedition(cfg, initial, target); expect(first.status).toBe("exploring"); expect(first.lastSettledMs).toBe(initial.startedAtMs + 2 * HOUR);
    const second = recallExpedition(cfg, first, target); expect(second.status).toBe("exploring"); expect(second.lastSettledMs).toBe(initial.startedAtMs + 4 * HOUR);
    const third = recallExpedition(cfg, second, target); expect(third.status).toBe("returning"); expect(third.elapsedMs).toBe(5 * HOUR);
    const full = recallExpedition(config(), initial, target); expect(third).toEqual(full);
    const instantFirst = returnExpeditionNow(cfg, initial, target); expect(instantFirst.status).toBe("exploring");
    const instantSecond = returnExpeditionNow(cfg, instantFirst, target); expect(instantSecond.status).toBe("exploring");
    const home = returnExpeditionNow(cfg, instantSecond, target); expect(home.status).toBe("home");
    expect(home.carried).toEqual(full.carried); expect(home.cursor).toBe(full.cursor);
    expect(home.log.at(-1)?.at).toBe(target);
  });

  test("policies and cadence retune at the persisted frontier without losing reward state", () => {
    const initial = dispatch(); const partial = settleExpedition(config(), initial, initial.startedAtMs + 1.5 * HOUR);
    const tuned = settleExpedition(config({ tickMs: 2 * HOUR, hazard: () => ({ damage: 5 }) }), partial, initial.startedAtMs + 5 * HOUR);
    expect(tuned.log.filter(event => event.kind === "loot").map(event => event.at)).toEqual([initial.startedAtMs + HOUR, initial.startedAtMs + 3 * HOUR, initial.startedAtMs + 5 * HOUR]);
    expect(tuned.hp).toBe(90); expect(tuned.carried.reduce((sum, drop) => sum + drop.count, 0)).toBeGreaterThanOrEqual(3);
  });

  test("zero return fraction and instant return are terminal while zero-HP dispatch stays dead", () => {
    const initial = dispatch(); const target = initial.startedAtMs + 2 * HOUR;
    expect(recallExpedition(config({ returnFraction: 0 }), initial, target).status).toBe("home");
    const traveling = recallExpedition(config(), initial, target);
    expect(returnExpeditionNow(config(), traveling, target + 1).status).toBe("home");
    const dead = dispatch({ hp: 0 }); expect(returnExpeditionNow(config(), dead, target)).toBe(dead);
  });

  test("invalid time, budgets, supplies and policy values reject without changing saved data", () => {
    const initial = dispatch(); const snapshot = structuredClone(initial);
    for (const tickMs of [0, -1, NaN, Infinity, 0.5]) expect(() => settleExpedition(config({ tickMs }), initial, initial.startedAtMs + HOUR)).toThrow();
    for (const value of [NaN, Infinity, -1]) {
      expect(() => dispatch({ hp: value })).toThrow(); expect(() => dispatch({ supplies: { heal: value } })).toThrow();
      expect(() => settleExpedition(config({ returnFraction: value }), initial, initial.startedAtMs + HOUR)).toThrow();
    }
    expect(() => settleExpedition(config(), initial, Infinity)).toThrow();
    expect(() => settleExpedition(config({ maxTicksPerSettle: 0 }), initial, initial.startedAtMs + HOUR)).toThrow();
    expect(() => settleExpedition(config({ hazard: () => ({ damage: NaN }) }), initial, initial.startedAtMs + HOUR)).toThrow();
    expect(() => settleExpedition(config({ randomStep: cursor => [1, cursor] }), initial, initial.startedAtMs + HOUR)).toThrow();
    expect(() => settleExpedition(config(), { ...initial, cursor: NaN as ExpeditionState["cursor"] }, initial.startedAtMs + HOUR)).toThrow();
    expect(initial).toEqual(snapshot);
  });

  test("injected persisted recurrence and capacity retuning still use the same event frontier", () => {
    const initial = dispatch(); let calls = 0;
    const cfg = config({ randomStep: cursor => { calls += 1; return [0, (cursor + 1) as ExpeditionState["cursor"]]; } });
    const first = settleExpedition(cfg, initial, initial.startedAtMs + HOUR);
    expect(first.carried).toEqual([{ item: "sample", count: 1 }]); expect(calls).toBe(2);
    expect(first.cursor).toBe(initial.cursor + 2);
    const tuned = settleExpedition({ ...cfg, carryCap: 1, hazard: () => ({ damage: 3 }) }, first, initial.startedAtMs + 5 * HOUR);
    expect(tuned.status).toBe("home"); expect(tuned.hp).toBe(97);
    expect(tuned.returnUntilMs).toBe(initial.startedAtMs + 3 * HOUR);
    expect(tuned.carried).toEqual(first.carried);
    expect(tuned.log.filter(event => event.kind === "hazard").map(event => event.at)).toEqual([initial.startedAtMs + 2 * HOUR]);
  });
});

describe("real runtime expedition compositions", () => {
  for (const policy of [
    { id: "deep-survey", item: "sample", damage: 1, supply: "medicine", healing: 3, fraction: 0.5 },
    { id: "courier-route", item: "parcel", damage: 2, supply: "ration", healing: 4, fraction: 0.25 },
  ]) {
    test(`${policy.id} persists through the native game store and resets independently`, () => {
      const cfg = config({ returnFraction: policy.fraction, loot: createLootPipeline({ id: policy.id, stages: [{ id: "authored-pool", table: { id: `${policy.id}-table`, entries: [{ item: policy.item, count: 1, weight: 1 }] } }] }),
        hazard: () => ({ damage: policy.damage }), supplies: [{ key: policy.supply, when: state => state.hp < 8, restoreHp: policy.healing }], describe: event => `${policy.id}: ${event.kind}` });
      const initial = () => dispatch({ id: policy.id, hp: 10, supplies: { [policy.supply]: 2 }, seed: policy.id });
      const mission = defineStore<ExpeditionState>(`expedition:${policy.id}`, initial);
      const clock = defineStore("clock-ms", initial().startedAtMs);
      const system = defineSystem({ id: "away-mission", tick: { type: "frame" }, update: ctx => mission.update(ctx, previous => settleExpedition(cfg, previous, clock.read(ctx))), reset: ctx => { mission.clear(ctx); clock.clear(ctx); } });
      const game = defineGameDefinition({ name: policy.id, multiplayer: "off", systems: [system] });
      const boot = () => { const ctx = createGameContext({ definition: game, content: {}, player: { userId: "caller", isNew: true } }); game.loop?.onInit?.(ctx); return ctx; };
      const live = boot(); clock.write(live, initial().startedAtMs + 3 * HOUR); game.loop?.onTick?.(live, 0.1);
      const saved = JSON.parse(JSON.stringify(live.state())); const restored = boot(); restored.restore(saved);
      expect(mission.read(restored)).toEqual(mission.read(live));
      expect(mission.read(restored).carried).toEqual([{ item: policy.item, count: 3 }]);
      const target = initial().startedAtMs + 6 * HOUR;
      mission.update(live, previous => recallExpedition(cfg, previous, target)); mission.update(restored, previous => recallExpedition(cfg, previous, target));
      expect(mission.read(restored)).toEqual(mission.read(live));
      expect(mission.read(restored).returnUntilMs).toBe(target + 6 * HOUR * policy.fraction);
      game.loop?.onReset?.(restored); expect(mission.read(restored)).toEqual(initial());
      expect(mission.read(live).status).toBe("returning"); expect(saved).not.toEqual(live.state());
      game.loop?.onDispose?.(live); game.loop?.onDispose?.(restored);
    });
  }
});
