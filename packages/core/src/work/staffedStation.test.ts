import { describe, expect, test } from "bun:test";

import { createProductionState, feedProduction, productionBuilding, tickProduction, type ProductionState } from "../crafting/production";
import { defineGameDefinition } from "../game/defineGame";
import { defineSystem } from "../game/defineSystem";
import { createGameContext } from "../runtime/gameContext";
import { createStats } from "../stats/statModifiers";
import { defineStore } from "../store/defineStore";
import { stationOutputRate, type StaffedStation, type StationRateTuning } from "./staffedStation";

const workers = [{ id: "a", stat: 2 }, { id: "b", stat: 4 }, { id: "overflow", stat: 100 }];
const station: StaffedStation = { stationId: "generator", slots: 2, workers };
const tuning: StationRateTuning = { base: 1, perStat: 0.5 };

describe("stationOutputRate", () => {
  test("scales linearly with admitted stats and worker count", () => {
    expect(stationOutputRate({ ...station, workers: [] }, tuning)).toBe(1);
    expect(stationOutputRate({ ...station, workers: workers.slice(0, 1) }, tuning)).toBe(2);
    expect(stationOutputRate(station, tuning)).toBe(4);
    expect(stationOutputRate(station, { ...tuning, base: 0 })).toBe(3);
    expect(stationOutputRate({ ...station, workers: [] }, { ...tuning, base: 0 })).toBe(0);
  });

  test("slots bound work in caller order without sorting or modifying the snapshot", () => {
    const frozen = Object.freeze({ ...station, workers: Object.freeze(workers.map(worker => Object.freeze({ ...worker }))) });
    expect(stationOutputRate(frozen, tuning)).toBe(4);
    expect(stationOutputRate({ ...frozen, slots: 1.9 }, tuning)).toBe(2);
    expect(stationOutputRate({ ...frozen, slots: -1 }, tuning)).toBe(1);
    expect(stationOutputRate({ ...frozen, slots: 10 }, tuning)).toBe(54);
    expect(stationOutputRate({ ...frozen, workers: [workers[2]!, workers[0]!, workers[1]!] }, tuning)).toBe(52);
    expect(frozen.workers).toEqual(workers);
  });

  test("efficiency scales the full rate and clamps to its finite 0…1 domain", () => {
    expect(stationOutputRate(station, { ...tuning, efficiency: 0.25 })).toBe(1);
    expect(stationOutputRate(station, { ...tuning, efficiency: 0 })).toBe(0);
    expect(stationOutputRate(station, { ...tuning, efficiency: -2 })).toBe(0);
    expect(stationOutputRate(station, { ...tuning, efficiency: 2 })).toBe(4);
    expect(stationOutputRate({ ...station, workers: [] }, { ...tuning, efficiency: 0.5 })).toBe(0.5);
  });

  test("nonfinite data cannot poison production or admit overflow workers", () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(stationOutputRate({ ...station, slots: value }, tuning)).toBe(1);
      expect(stationOutputRate(station, { ...tuning, efficiency: value })).toBe(0);
      expect(stationOutputRate({ ...station, workers: [{ id: "bad", stat: value }, workers[1]!, workers[2]!] }, tuning)).toBe(3);
      expect(stationOutputRate(station, { base: value, perStat: 0.5 })).toBe(3);
      expect(stationOutputRate(station, { base: 1, perStat: value })).toBe(1);
    }
    expect(stationOutputRate({ ...station, workers: [{ id: "negative", stat: -20 }] }, tuning)).toBe(1);
    expect(stationOutputRate(station, { base: -1, perStat: -2 })).toBe(0);
    expect(stationOutputRate(station, { base: 1, perStat: Number.MAX_VALUE })).toBe(0);
    expect(stationOutputRate({ ...station, workers: [{ id: "a", stat: Number.MAX_VALUE }, { id: "b", stat: Number.MAX_VALUE }] }, { base: 1, perStat: 0 })).toBe(1);
  });

  test("fixed-window output composes with input reservations and the existing power gate", () => {
    const def = productionBuilding({ id: station.stationId, inputs: [{ itemId: "ore", count: 1 }], outputs: [{ itemId: "ingot", count: 2 }], rate: stationOutputRate(station, tuning), power: 1, bufferMultiplier: 20 });
    let state = feedProduction(def, createProductionState(), "ore", 12).state;
    expect(tickProduction(def, state, { dt: 2, powered: false })).toBe(state);
    for (let tick = 0; tick < 8; tick += 1) state = tickProduction(def, state, { dt: 0.25, powered: true });
    expect(state.output.ingot).toBe(16);
    expect(state.buffer.ore).toBe(3); // Eight finished batches plus the already-reserved ninth.
    expect(state.progress).toBe(0);
    const paused = { ...def, rate: stationOutputRate(station, { ...tuning, efficiency: 0 }) };
    expect(tickProduction(paused, state, { dt: 2, powered: true })).toBe(state);
  });
});

interface RoomState {
  staffing: StaffedStation;
  efficiency: number;
  production: ProductionState;
}

describe("caller-owned runtime compositions", () => {
  for (const policy of [
    { name: "strength generator", stat: "strength" as const, base: 0, perStat: 0.5, efficiency: 1, output: "power", expected: 8 },
    { name: "modified agility workshop", stat: "agility" as const, base: 2, perStat: 0.2, efficiency: 0.5, output: "food", expected: 4 },
  ]) {
    test(`${policy.name} schedules production and restores/reset plain staffing plus progress`, () => {
      const stats = createStats({ strength: 4, agility: 2 });
      stats.addSource("caller-equipment", { agility: { add: 1, multiply: 2 } });
      const initial = (): RoomState => ({
        staffing: { stationId: policy.name, slots: 2, workers: [{ id: "first", stat: stats.get(policy.stat) }, { id: "second", stat: 4 }] },
        efficiency: policy.efficiency,
        production: createProductionState(),
      });
      const room = defineStore<RoomState>(`room:${policy.name}`, initial);
      const system = defineSystem({ id: "staffed-production", tick: { type: "fixed", rate: 4 },
        update: (ctx, dt) => room.update(ctx, previous => ({ ...previous,
          production: tickProduction(productionBuilding({ id: previous.staffing.stationId, outputs: [{ itemId: policy.output, count: 1 }], rate: stationOutputRate(previous.staffing, { base: policy.base, perStat: policy.perStat, efficiency: previous.efficiency }) }), previous.production, { dt }),
        })),
        reset: ctx => room.write(ctx, initial()),
      });
      const game = defineGameDefinition({ name: policy.name, multiplayer: "off", systems: [system] });
      const boot = () => { const ctx = createGameContext({ definition: game, content: {}, player: { userId: "worker-owner", isNew: true } }); game.loop?.onInit?.(ctx); return ctx; };
      const advance = (ctx: ReturnType<typeof boot>, ticks: number) => { for (let index = 0; index < ticks; index += 1) game.loop?.onTick?.(ctx, 0.25); };
      const live = boot(); advance(live, 3);
      const saved = JSON.parse(JSON.stringify(live.state()));
      const restored = boot(); restored.restore(saved);
      expect(room.read(restored)).toEqual(room.read(live));
      expect(room.read(restored).staffing.workers.map(worker => worker.stat)).toEqual([policy.stat === "strength" ? 4 : 6, 4]);
      advance(live, 5); advance(restored, 5);
      expect(room.read(live).production.output[policy.output]).toBe(policy.expected);
      expect(room.read(restored)).toEqual(room.read(live));
      expect(saved).not.toEqual(live.state());
      room.update(restored, previous => ({ ...previous, staffing: { ...previous.staffing, workers: [] } }));
      advance(restored, 4);
      expect(room.read(restored).production.output[policy.output]).toBe(policy.expected + (policy.base === 0 ? 0 : 1));
      game.loop?.onReset?.(restored); expect(room.read(restored)).toEqual(initial());
      expect(room.read(live).production.output[policy.output]).toBe(policy.expected);
      advance(restored, 8); expect(room.read(restored).production.output[policy.output]).toBe(policy.expected);
      game.loop?.onDispose?.(live); game.loop?.onDispose?.(restored);
    });
  }
});
