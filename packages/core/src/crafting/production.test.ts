import { describe, expect, test } from "bun:test";

import {
  advanceTransport,
  createProductionState,
  drainOutput,
  feedProduction,
  productionBuilding,
  resolvePowerGrid,
  tickProduction,
  type TransportItem,
} from "./production";

const smelter = productionBuilding({
  id: "smelter",
  inputs: [{ itemId: "ore", count: 2 }],
  outputs: [{ itemId: "ingot", count: 1 }],
  rate: 0.5,
});

describe("production building", () => {
  test("consumes buffered inputs and emits outputs over simClock dt", () => {
    let state = createProductionState();
    state = feedProduction(smelter, state, "ore", 4).state;
    expect(state.buffer.ore).toBe(4);

    state = tickProduction(smelter, state, { dt: 1 });
    expect(state.active).toBe(true);
    expect(state.output.ingot ?? 0).toBe(0);

    state = tickProduction(smelter, state, { dt: 1 });
    expect(state.output.ingot).toBe(1);
  });

  test("fast-forward dt completes multiple cycles at once", () => {
    const bigBuffer = productionBuilding({
      id: "smelter_xl",
      inputs: [{ itemId: "ore", count: 2 }],
      outputs: [{ itemId: "ingot", count: 1 }],
      rate: 0.5,
      bufferMultiplier: 3,
    });
    let state = createProductionState();
    state = feedProduction(bigBuffer, state, "ore", 6).state;
    expect(state.buffer.ore).toBe(6);
    state = tickProduction(bigBuffer, state, { dt: 10 });
    expect(state.output.ingot).toBe(3);
    expect(state.buffer.ore ?? 0).toBe(0);
  });

  test("stalls when inputs run out and resumes when refed", () => {
    let state = createProductionState();
    state = feedProduction(smelter, state, "ore", 2).state;
    state = tickProduction(smelter, state, { dt: 2 });
    expect(state.output.ingot).toBe(1);
    expect(state.active).toBe(false);

    state = tickProduction(smelter, state, { dt: 5 });
    expect(state.output.ingot).toBe(1);

    state = feedProduction(smelter, state, "ore", 2).state;
    state = tickProduction(smelter, state, { dt: 2 });
    expect(state.output.ingot).toBe(2);
  });

  test("output can be drained by a puller", () => {
    let state = createProductionState();
    state = feedProduction(smelter, state, "ore", 2).state;
    state = tickProduction(smelter, state, { dt: 2 });
    const drain = drainOutput(state, "ingot");
    expect(drain.taken).toBe(1);
    expect(drain.state.output.ingot ?? 0).toBe(0);
  });

  test("input buffer respects capacity", () => {
    let state = createProductionState();
    const first = feedProduction(smelter, state, "ore", 100);
    state = first.state;
    expect(first.accepted).toBe(4);
    expect(state.buffer.ore).toBe(4);
  });

  test("power-required building only runs when powered", () => {
    const powered = productionBuilding({ id: "assembler", outputs: [{ itemId: "widget", count: 1 }], rate: 1, power: 5 });
    let state = createProductionState();
    state = tickProduction(powered, state, { dt: 2, powered: false });
    expect(state.output.widget ?? 0).toBe(0);
    state = tickProduction(powered, state, { dt: 2, powered: true });
    expect(state.output.widget).toBeGreaterThan(0);
  });
});

describe("transport along path", () => {
  test("moves items and delivers them at the end", () => {
    const path = { length: 10, speed: 2 };
    const items: TransportItem[] = [
      { itemId: "ingot", count: 1, position: 0 },
      { itemId: "ingot", count: 1, position: 9 },
    ];
    const step1 = advanceTransport(path, items, 1);
    expect(step1.delivered).toHaveLength(1);
    expect(step1.items).toHaveLength(1);
    expect(step1.items[0]!.position).toBe(2);
  });
});

describe("power grid", () => {
  test("powers consumers greedily until supply is exhausted", () => {
    const result = resolvePowerGrid(10, [
      { id: "a", demand: 6 },
      { id: "b", demand: 6 },
      { id: "c", demand: 3 },
    ]);
    expect(result.powered.has("a")).toBe(true);
    expect(result.powered.has("b")).toBe(false);
    expect(result.powered.has("c")).toBe(true);
    expect(result.deficit).toBe(5);
  });
});
