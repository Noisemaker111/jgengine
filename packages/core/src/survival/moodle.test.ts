import { describe, expect, test } from "bun:test";

import { createMoodleStack, stackMoodles, type Moodle } from "./moodle";

const moodle = (over: Partial<Moodle> & Pick<Moodle, "id">): Moodle => ({
  label: over.id,
  severity: "neutral",
  source: "meter",
  stacks: 1,
  ...over,
});

describe("stackMoodles", () => {
  test("orders worst severity first", () => {
    const out = stackMoodles([
      moodle({ id: "a", severity: "good" }),
      moodle({ id: "b", severity: "critical" }),
      moodle({ id: "c", severity: "warning" }),
    ]);
    expect(out.map((m) => m.id)).toEqual(["b", "c", "a"]);
  });

  test("folds same-id moodles: stacks add, worst severity wins", () => {
    const out = stackMoodles(
      [moodle({ id: "bleed", severity: "warning", stacks: 1 })],
      [moodle({ id: "bleed", severity: "critical", stacks: 2 })],
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.stacks).toBe(3);
    expect(out[0]!.severity).toBe("critical");
  });

  test("merges meter, ailment and buff groups into one display", () => {
    const out = stackMoodles(
      [moodle({ id: "hungry", source: "meter" })],
      [moodle({ id: "bleed", source: "ailment", severity: "critical" })],
      [moodle({ id: "rested", source: "buff", severity: "good" })],
    );
    expect(out.map((m) => m.id)).toEqual(["bleed", "hungry", "rested"]);
  });
});

describe("createMoodleStack", () => {
  test("timed buffs expire on game time", () => {
    const stack = createMoodleStack();
    stack.add({ id: "boar", label: "Boar meat", duration: 10, severity: "good" });
    expect(stack.has("boar")).toBe(true);
    stack.tick(6);
    expect(stack.list()[0]!.fraction).toBeCloseTo(0.4, 5);
    stack.tick(5);
    expect(stack.has("boar")).toBe(false);
  });

  test("three concurrent food buffs coexist (Valheim)", () => {
    const stack = createMoodleStack();
    stack.add({ id: "honey", label: "Honey", duration: 20 });
    stack.add({ id: "sausage", label: "Sausage", duration: 30 });
    stack.add({ id: "carrot", label: "Carrot soup", duration: 25 });
    expect(stack.list()).toHaveLength(3);
    stack.tick(22);
    expect(stack.list().map((m) => m.id).sort()).toEqual(["carrot", "sausage"]);
  });

  test("re-adding refreshes duration", () => {
    const stack = createMoodleStack();
    stack.add({ id: "warm", label: "Warm", duration: 5 });
    stack.tick(4);
    stack.add({ id: "warm", label: "Warm", duration: 5 });
    stack.tick(4);
    expect(stack.has("warm")).toBe(true);
  });

  test("moodles with no duration persist until removed", () => {
    const stack = createMoodleStack();
    stack.add({ id: "sheltered", label: "Sheltered" });
    stack.tick(1000);
    expect(stack.has("sheltered")).toBe(true);
    stack.remove("sheltered");
    expect(stack.has("sheltered")).toBe(false);
  });
});
