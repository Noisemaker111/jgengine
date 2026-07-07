import { describe, expect, test } from "bun:test";
import { createThreatTable } from "@jgengine/core/ai/threat";

describe("threat table accumulate", () => {
  test("adds and reads per-source threat", () => {
    const table = createThreatTable();
    table.add("healer", 30);
    table.add("healer", 20);
    table.add("dps", 40);
    expect(table.threatOf("healer")).toBe(50);
    expect(table.threatOf("dps")).toBe(40);
  });

  test("clamps at max", () => {
    const table = createThreatTable({ max: 100 });
    table.add("dps", 250);
    expect(table.threatOf("dps")).toBe(100);
  });

  test("highest returns the top threat source", () => {
    const table = createThreatTable();
    table.add("healer", 50);
    table.add("dps", 80);
    expect(table.highest()).toBe("dps");
  });

  test("ranked is ordered high-to-low", () => {
    const table = createThreatTable();
    table.add("a", 10);
    table.add("b", 30);
    table.add("c", 20);
    expect(table.ranked().map((e) => e.sourceId)).toEqual(["b", "c", "a"]);
  });
});

describe("threat table decay", () => {
  test("decays linearly per game-second and forgets at zero", () => {
    const table = createThreatTable({ decayPerSecond: 10 });
    table.add("dps", 25);
    table.decay(1);
    expect(table.threatOf("dps")).toBe(15);
    table.decay(2);
    expect(table.threatOf("dps")).toBe(0);
    expect(table.size()).toBe(0);
  });

  test("forgetBelow drops low entries", () => {
    const table = createThreatTable({ decayPerSecond: 1, forgetBelow: 5 });
    table.add("dps", 6);
    table.decay(2);
    expect(table.size()).toBe(0);
  });

  test("no decay configured leaves threat intact", () => {
    const table = createThreatTable();
    table.add("dps", 10);
    table.decay(100);
    expect(table.threatOf("dps")).toBe(10);
  });
});

describe("threat stickiness", () => {
  test("keeps the current target until another exceeds it by the stickiness factor", () => {
    const table = createThreatTable();
    table.add("tank", 100);
    table.add("dps", 105);
    expect(table.highest({ current: "tank", stickiness: 1.1 })).toBe("tank");
    table.add("dps", 10);
    expect(table.highest({ current: "tank", stickiness: 1.1 })).toBe("dps");
  });

  test("removing a source clears its threat", () => {
    const table = createThreatTable();
    table.add("dps", 40);
    table.remove("dps");
    expect(table.highest()).toBeNull();
  });
});
