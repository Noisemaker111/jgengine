import { expect, test } from "bun:test";
import { defineCommand, runCommand } from "./commandRunner";
import {
  readInputArray,
  readInputNumber,
  readInputOneOf,
  readInputPoint3,
  readInputString,
  readQuantity,
} from "./commandInput";
import { createRuntimeSnapshot } from "./snapshot";

test("purchase quantities reject malformed and out of bounds input without coercion", () => {
  for (const value of [NaN, Infinity, -Infinity, -1, 0, 1.5, 101, "2", null, {}, undefined]) {
    expect(readQuantity(value, { min: 1, max: 100 })).toEqual({ ok: false, reason: "invalid-quantity" });
  }
  expect(readQuantity(100, { min: 1, max: 100 })).toEqual({ ok: true, quantity: 100 });
  expect(readQuantity(0, { min: 0 })).toEqual({ ok: true, quantity: 0 });
  expect(() => readQuantity(1, { min: 2, max: 1 })).toThrow();
});

test("input readers reject non-finite, fractional, oversized and wrong-typed values", () => {
  for (const value of [NaN, Infinity, -Infinity, "1", null, undefined]) expect(readInputNumber(value)).toBeNull();
  expect(readInputNumber(0.5, { integer: true })).toBeNull();
  expect(readInputNumber(5, { min: 0, max: 4 })).toBeNull();
  expect(readInputNumber(4, { min: 0, max: 4, integer: true })).toBe(4);
  expect(readInputString("")).toBeNull();
  expect(readInputString("x".repeat(9), { maxLength: 8 })).toBeNull();
  expect(readInputOneOf(2, [0, 1, 2, 3] as const)).toBe(2);
  expect(readInputOneOf("north", [0, 1] as const)).toBeNull();
  expect(readInputPoint3({ x: 1, y: 0, z: Infinity })).toBeNull();
  expect(readInputPoint3({ x: 1e6, y: 0, z: 0 }, { maxAbs: 1e5 })).toBeNull();
  expect(readInputPoint3({ x: 1, y: 2, z: 3 })).toEqual({ x: 1, y: 2, z: 3 });
  expect(readInputArray([1, 2], value => readInputNumber(value), { maxItems: 1 })).toBeNull();
  expect(readInputArray([1, "2"], value => readInputNumber(value))).toBeNull();
  expect(readInputArray([1, 2], value => readInputNumber(value))).toEqual([1, 2]);
});

test("a command's parse runs before validate and apply, which only see parsed input", () => {
  const seen: unknown[] = [];
  const commands = {
    move: defineCommand<{ x: number }>({
      parse: input => {
        const x = readInputNumber((input as { x?: unknown } | null)?.x, { min: -10, max: 10 });
        return x === null ? null : { x };
      },
      validate: (_snapshot, input) => {
        seen.push(input);
        return null;
      },
      apply: snapshot => snapshot,
    }),
    raw: { validate: () => null, apply: (snapshot: ReturnType<typeof createRuntimeSnapshot>) => snapshot },
  };
  const snapshot = createRuntimeSnapshot({ gameId: "demo", serverId: "s1" });
  expect(runCommand(snapshot, commands, "move", { x: Infinity }, "alice")).toEqual({ ok: false, reason: "Malformed command input" });
  expect(seen).toEqual([]);
  expect(runCommand(snapshot, commands, "move", { x: 3, extra: true }, "alice").ok).toBe(true);
  expect(seen).toEqual([{ x: 3 }]);
  expect(runCommand(snapshot, commands, "raw", null, "alice").ok).toBe(true);
});
