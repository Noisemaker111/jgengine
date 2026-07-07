import { describe, expect, test } from "bun:test";

import {
  createModifierPipeline,
  runPipeline,
  type Modifier,
} from "@jgengine/core/cards/modifierPipeline";

describe("runPipeline", () => {
  test("applies modifiers in order", () => {
    const mods: Modifier<number>[] = [
      { id: "add", source: "base", apply: (v) => v + 10 },
      { id: "double", source: "joker", apply: (v) => v * 2 },
      { id: "minus", source: "debuff", apply: (v) => v - 5 },
    ];
    const result = runPipeline(0, mods);
    expect(result.base).toBe(0);
    expect(result.value).toBe((0 + 10) * 2 - 5);
  });

  test("order matters", () => {
    const add: Modifier<number> = { id: "add", apply: (v) => v + 10 };
    const mult: Modifier<number> = { id: "mult", apply: (v) => v * 2 };
    expect(runPipeline(5, [add, mult]).value).toBe((5 + 10) * 2);
    expect(runPipeline(5, [mult, add]).value).toBe(5 * 2 + 10);
  });

  test("trace records before/after/changed per step", () => {
    const mods: Modifier<number>[] = [
      { id: "noop", apply: (v) => v },
      { id: "add", source: "j1", apply: (v) => v + 3 },
    ];
    const { trace } = runPipeline(1, mods);
    expect(trace).toHaveLength(2);
    expect(trace[0]).toMatchObject({ id: "noop", index: 0, before: 1, after: 1, changed: false });
    expect(trace[1]).toMatchObject({ id: "add", source: "j1", index: 1, before: 1, after: 4, changed: true });
  });

  test("modifier context sees base and prior trace", () => {
    const seen: number[] = [];
    const mods: Modifier<number>[] = [
      { id: "a", apply: (v) => v + 1 },
      {
        id: "b",
        apply: (v, ctx) => {
          seen.push(ctx.base, ctx.index, ctx.trace.length);
          return v + ctx.base;
        },
      },
    ];
    const result = runPipeline(10, mods);
    expect(seen).toEqual([10, 1, 1]);
    expect(result.value).toBe(10 + 1 + 10);
  });

  test("works over a struct value (Balatro chips × mult)", () => {
    interface Score {
      chips: number;
      mult: number;
    }
    const mods: Modifier<Score>[] = [
      { id: "pair", apply: (s) => ({ chips: s.chips + 10, mult: s.mult + 2 }) },
      { id: "joker", apply: (s) => ({ chips: s.chips, mult: s.mult * 3 }) },
    ];
    const result = runPipeline({ chips: 5, mult: 1 }, mods);
    expect(result.value).toEqual({ chips: 15, mult: 9 });
    expect(result.trace[1].before).toEqual({ chips: 15, mult: 3 });
  });
});

describe("createModifierPipeline", () => {
  test("add / insertAt / remove reorder the run", () => {
    const pipe = createModifierPipeline<number>();
    pipe.add({ id: "double", apply: (v) => v * 2 });
    pipe.add({ id: "plus5", apply: (v) => v + 5 });
    expect(pipe.run(10).value).toBe(10 * 2 + 5);

    pipe.insertAt(0, { id: "plus1", apply: (v) => v + 1 });
    expect(pipe.run(10).value).toBe((10 + 1) * 2 + 5);

    expect(pipe.remove("double")).toBe(true);
    expect(pipe.run(10).value).toBe(10 + 1 + 5);
    expect(pipe.remove("missing")).toBe(false);
  });
});
