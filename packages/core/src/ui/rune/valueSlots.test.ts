import { expect, test } from "bun:test";
import { RuneValueSlots, type RuneTextSlots } from "./valueSlots";

const read = (values: Float32Array, slots: RuneTextSlots): string => String.fromCharCode(...slots.u.slice(0, values[slots.n]).map((slot) => values[slot] ?? 0));

test("formatted live text and Unicode travel through stable shared slots", () => {
  const values = new Float32Array(64);
  const slots = new RuneValueSlots(() => values);
  const first = slots.writeText("timer", "01:23 🦉");
  const binding = first.slots;
  expect(read(values, binding)).toBe("01:23 🦉");
  const second = slots.writeText("timer", "01:22 🦉");
  expect(second.slots).toBe(binding);
  expect(second.grew).toBe(false);
  expect(second.changed).toBe(true);
  expect(read(values, binding)).toBe("01:22 🦉");
  expect(slots.writeText("timer", "01:22 🦉").changed).toBe(false);
  expect(slots.write("health", 0.1)).toBe(true);
  expect(slots.write("health", 0.1)).toBe(false);
});

test("text growth preserves neighbouring values and removed labels release their slots", () => {
  const values = new Float32Array(16);
  const slots = new RuneValueSlots(() => values);
  const first = slots.writeText("a", "x");
  const second = slots.writeText("b", "y");
  expect(slots.writeText("a", "longer").grew).toBe(true);
  expect(read(values, first.slots)).toBe("longer");
  expect(read(values, second.slots)).toBe("y");
  slots.releaseText("a");
  for (let index = 0; index < 100; index += 1) {
    slots.writeText(`label-${index}`, "text");
    slots.releaseText(`label-${index}`);
  }
  expect(read(values, second.slots)).toBe("y");
  expect(() => slots.writeText("too large", "x".repeat(32))).toThrow("shared value buffer is full");
  expect(slots.writeText("still usable", "ok").changed).toBe(true);
  for (let index = 0; index < 100; index += 1) {
    slots.write(`meter-${index}`, index / 100);
    slots.release(`meter-${index}`);
  }
  expect(read(values, second.slots)).toBe("y");
});
