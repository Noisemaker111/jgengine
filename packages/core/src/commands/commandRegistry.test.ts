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

  test("apply may return void for side-effect-only commands, leaving state identical", () => {
    const registry = createCommandRegistry<CounterState>();
    let sideEffectCalls = 0;
    registry.define<{ amount: number }>("log", {
      apply(_state, input) {
        sideEffectCalls += input.amount;
      },
    });

    const state: CounterState = { count: 1 };
    const result = registry.run(state, "log", { amount: 5 });

    expect(result).toEqual({ status: "applied", state: { count: 1 } });
    expect(result.status === "applied" && result.state).toBe(state);
    expect(sideEffectCalls).toBe(5);
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

  describe("decode codec", () => {
    function decodeAmount(input: unknown): { ok: true; value: { amount: number } } | { ok: false; reason: string } {
      if (
        typeof input !== "object" ||
        input === null ||
        typeof (input as Record<string, unknown>).amount !== "number"
      ) {
        return { ok: false, reason: "expected { amount: number }" };
      }
      return { ok: true, value: { amount: (input as Record<string, unknown>).amount as number } };
    }

    test("rejects a malformed payload before validate/apply run", () => {
      const registry = createCommandRegistry<CounterState>();
      let validateCalls = 0;
      let applyCalls = 0;
      registry.define<{ amount: number }>("increment", {
        decode: decodeAmount,
        validate() {
          validateCalls += 1;
          return null;
        },
        apply(state, input) {
          applyCalls += 1;
          return { count: state.count + input.amount };
        },
      });

      const result = registry.run({ count: 1 }, "increment", { amount: "five" });

      expect(result).toEqual({ status: "rejected", reason: "expected { amount: number }" });
      expect(validateCalls).toBe(0);
      expect(applyCalls).toBe(0);
    });

    test("rejects an unknown command regardless of any declared codec", () => {
      const registry = createCommandRegistry<CounterState>();
      registry.define<{ amount: number }>("increment", { decode: decodeAmount, apply: (state) => state });

      const result = registry.run({ count: 0 }, "nonexistent", { amount: 1 });

      expect(result).toEqual({ status: "unknown-command" });
    });

    test("passes a valid payload through unchanged to validate/apply", () => {
      const registry = createCommandRegistry<CounterState>();
      let seenByValidate: unknown;
      let seenByApply: unknown;
      registry.define<{ amount: number }>("increment", {
        decode: decodeAmount,
        validate(_state, input) {
          seenByValidate = input;
          return null;
        },
        apply(state, input) {
          seenByApply = input;
          return { count: state.count + input.amount };
        },
      });

      const result = registry.run({ count: 1 }, "increment", { amount: 5 });

      expect(result).toEqual({ status: "applied", state: { count: 6 } });
      expect(seenByValidate).toEqual({ amount: 5 });
      expect(seenByApply).toEqual({ amount: 5 });
    });

    test("commands without a decoder keep passing raw input through unchanged", () => {
      const registry = createCommandRegistry<CounterState>();
      registry.define<{ amount: unknown }>("legacy", {
        apply(state, input) {
          return { count: state.count + (input.amount as number) };
        },
      });

      const result = registry.run({ count: 1 }, "legacy", { amount: 5 });

      expect(result).toEqual({ status: "applied", state: { count: 6 } });
    });
  });
});
