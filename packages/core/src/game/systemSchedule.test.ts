import { describe, expect, test } from "bun:test";

import { defineSystem } from "./defineSystem";
import {
  compileSystemSchedule,
  DEFAULT_FIXED_STAGES,
  orderWithConstraints,
} from "./systemSchedule";

describe("orderWithConstraints", () => {
  test("stable by declaration index when unconstrained", () => {
    const indexOf = new Map([
      ["c", 2],
      ["a", 0],
      ["b", 1],
    ]);
    expect(
      orderWithConstraints(["c", "a", "b"], new Map(), new Map(), indexOf),
    ).toEqual(["a", "b", "c"]);
  });

  test("after/before edges override declaration order", () => {
    const indexOf = new Map([
      ["first", 0],
      ["second", 1],
      ["third", 2],
    ]);
    const after = new Map<string, readonly string[]>([["third", ["first"]]]);
    const before = new Map<string, readonly string[]>([["second", ["third"]]]);
    expect(
      orderWithConstraints(["first", "second", "third"], after, before, indexOf),
    ).toEqual(["first", "second", "third"]);
  });

  test("detects cycles", () => {
    const indexOf = new Map([
      ["a", 0],
      ["b", 1],
    ]);
    const after = new Map<string, readonly string[]>([
      ["a", ["b"]],
      ["b", ["a"]],
    ]);
    expect(() => orderWithConstraints(["a", "b"], after, new Map(), indexOf)).toThrow(/cyclic/);
  });
});

describe("compileSystemSchedule", () => {
  test("multiple systems share the same fixed channel and stage order", () => {
    const schedule = compileSystemSchedule([
      defineSystem({
        id: "projectiles",
        tick: { type: "fixed", rate: 60, stage: "combat" },
      }),
      defineSystem({
        id: "damage",
        tick: { type: "fixed", rate: 60, stage: "combat", after: "projectiles" },
      }),
      defineSystem({
        id: "movement",
        tick: { type: "fixed", rate: 60, stage: "movement" },
      }),
    ]);

    expect(schedule.fixed).toHaveLength(1);
    expect(schedule.fixed[0]!.rate).toBe(60);
    expect(schedule.fixed[0]!.order).toEqual(["movement", "projectiles", "damage"]);
    const stages = schedule.fixed[0]!.stages.map((s) => s.stage);
    expect(stages.indexOf("movement")).toBeLessThan(stages.indexOf("combat"));
  });

  test("multiple systems may subscribe to the same frame channel", () => {
    const schedule = compileSystemSchedule([
      defineSystem({ id: "camera", tick: { type: "frame", stage: "camera" } }),
      defineSystem({ id: "vfx", tick: { type: "frame", stage: "effects" } }),
      defineSystem({ id: "anim", tick: { type: "frame", stage: "animation" } }),
      defineSystem({ id: "mobs", tick: { type: "frame", stage: "ai" } }),
    ]);
    expect(schedule.frameOrder).toEqual(["mobs", "anim", "camera", "vfx"]);
  });

  test("interval multi-subscribe keeps each system period", () => {
    const schedule = compileSystemSchedule([
      defineSystem({ id: "director", tick: { type: "interval", every: 1 } }),
      defineSystem({ id: "mail", tick: { type: "interval", every: 5 } }),
    ]);
    expect(schedule.intervals.map((s) => s.id)).toEqual(["director", "mail"]);
    expect(schedule.intervals[0]!.every).toBe(1);
    expect(schedule.intervals[1]!.every).toBe(5);
  });

  test("event-only and manual systems do not auto-tick", () => {
    const schedule = compileSystemSchedule([
      defineSystem({
        id: "progression",
        events: { "enemy.defeated": () => {} },
      }),
      defineSystem({ id: "debug", tick: { type: "manual" } }),
      defineSystem({ id: "combat", tick: { type: "frame" } }),
    ]);
    expect(schedule.eventOnly).toEqual(["progression"]);
    expect(schedule.manual).toEqual(["debug"]);
    expect(schedule.tickOrder).toEqual(["combat"]);
  });

  test("dependsOn must resolve to installed systems", () => {
    expect(() =>
      compileSystemSchedule([
        defineSystem({ id: "quests", dependsOn: ["missing"], tick: { type: "frame" } }),
      ]),
    ).toThrow(/dependsOn unknown/);
  });

  test("duplicate ids are rejected", () => {
    expect(() =>
      compileSystemSchedule([
        defineSystem({ id: "a", tick: { type: "frame" } }),
        defineSystem({ id: "a", tick: { type: "frame" } }),
      ]),
    ).toThrow(/duplicate/);
  });

  test("default fixed stages match the public table", () => {
    expect([...DEFAULT_FIXED_STAGES]).toEqual([
      "input",
      "movement",
      "combat",
      "ai",
      "activities",
      "cleanup",
    ]);
  });

  test("unknown stages sort after known ones, alphabetically among themselves", () => {
    const schedule = compileSystemSchedule([
      defineSystem({ id: "late", tick: { type: "frame", stage: "zzz" } }),
      defineSystem({ id: "early", tick: { type: "frame", stage: "aaa" } }),
      defineSystem({ id: "fx", tick: { type: "frame", stage: "effects" } }),
    ]);
    expect(schedule.frameOrder).toEqual(["fx", "early", "late"]);
  });
});
