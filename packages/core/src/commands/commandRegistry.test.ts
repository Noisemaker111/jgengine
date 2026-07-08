import { describe, expect, test } from "bun:test";
import { createCommandRegistry } from "@jgengine/core/commands/commandRegistry";

interface CounterState {
  count: number;
}

describe("command registry", () => {
  test("applies a defined command's state transition", () => {
    const registry = createCommandRegistry<CounterState>();
    registry.define<{ amount: number }>("increment", {
      apply(state, input) {
        return { count: state.count + input.amount };
      },
    });

    const result = registry.run({ count: 1 }, "increment", { amount: 5 });

    expect(result).toEqual({ status: "applied", state: { count: 6 } });
  });

  test("short-circuits on validate rejection without applying", () => {
    const registry = createCommandRegistry<CounterState>();
    let applyCalls = 0;
    registry.define<{ amount: number }>("decrement", {
      validate(state, input) {
        return state.count - input.amount < 0 ? { reason: "would go negative" } : null;
      },
      apply(state, input) {
        applyCalls += 1;
        return { count: state.count - input.amount };
      },
    });

    const result = registry.run({ count: 1 }, "decrement", { amount: 5 });

    expect(result).toEqual({ status: "rejected", reason: "would go negative" });
    expect(applyCalls).toBe(0);
  });

  test("returns unknown-command for an undefined name", () => {
    const registry = createCommandRegistry<CounterState>();

    const result = registry.run({ count: 0 }, "nonexistent", {});

    expect(result).toEqual({ status: "unknown-command" });
  });

  test("throws when redefining an existing command name", () => {
    const registry = createCommandRegistry<CounterState>();
    registry.define<{ amount: number }>("increment", {
      apply(state, input) {
        return { count: state.count + input.amount };
      },
    });

    expect(() =>
      registry.define<{ amount: number }>("increment", {
        apply(state, input) {
          return { count: state.count + input.amount };
        },
      }),
    ).toThrow();
  });

  test("flows typed input through to apply", () => {
    const registry = createCommandRegistry<CounterState>();
    registry.define<{ label: string; amount: number }>("labeledIncrement", {
      apply(state, input) {
        return { count: state.count + input.label.length + input.amount };
      },
    });

    const result = registry.run({ count: 0 }, "labeledIncrement", { label: "ab", amount: 3 });

    expect(result).toEqual({ status: "applied", state: { count: 5 } });
  });

  test("a side-effect-only command reports applied with the original state reference", () => {
    const registry = createCommandRegistry<CounterState>();
    let sideEffectCalls = 0;
    registry.define<{ amount: number }>("logOnly", {
      apply(_state, input) {
        sideEffectCalls += input.amount;
      },
    });

    const state = { count: 1 };
    const result = registry.run(state, "logOnly", { amount: 5 });

    expect(sideEffectCalls).toBe(5);
    expect(result).toEqual({ status: "applied", state });
    if (result.status === "applied") expect(result.state).toBe(state);
  });

  test("reports registered command names", () => {
    const registry = createCommandRegistry<CounterState>();
    registry.define<{ amount: number }>("increment", {
      apply(state, input) {
        return { count: state.count + input.amount };
      },
    });

    expect(registry.has("increment")).toBe(true);
    expect(registry.has("missing")).toBe(false);
    expect(registry.names()).toEqual(["increment"]);
  });
});
