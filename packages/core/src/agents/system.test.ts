import { describe, expect, test } from "bun:test";

import type { UtilityOption } from "../ai/utilityBrain";
import { createAgentSystem, type AgentSystemState } from "./system";

const NEEDS = [
  { id: "hunger", max: 100, rate: 0, start: 90 },
  { id: "fun", max: 100, rate: 0, start: 90 },
];

const OPTIONS: readonly UtilityOption[] = [
  { id: "eat", terms: [{ need: "hunger", curve: { kind: "linear", from: 0.2, to: 0.95 } }] },
  { id: "play", terms: [{ need: "fun", curve: { kind: "linear", from: 0.2, to: 0.95 } }] },
  { id: "idle", base: 0.01 },
];

function park(extra: Partial<Parameters<typeof createAgentSystem>[0]> = {}) {
  return createAgentSystem({
    needs: NEEDS,
    options: OPTIONS,
    mood: { weights: [{ need: "hunger", weight: 2 }, { need: "fun", weight: 1 }] },
    clock: { now: () => 0 },
    ...extra,
  });
}

describe("createAgentSystem", () => {
  test("one tick drives every member and the selector runs once per member", () => {
    const seen: string[] = [];
    const system = park({
      members: [{ id: "a" }, { id: "b" }],
      select: (view) => {
        seen.push(view.id);
        return [
          { option: "eat", target: `${view.id}-diner` },
          { option: "play", target: `${view.id}-arcade` },
        ];
      },
    });
    expect(system.size()).toBe(2);
    system.tick(1);
    expect(seen.sort()).toEqual(["a", "b"]);
    expect(system.action("a")?.option).toBe("eat");
    expect(system.action("a")?.target).toBe("a-diner");
    expect(system.action("b")?.option).toBe("eat");
  });

  test("the system's fallback reaches targets that declare none", () => {
    let dinerOpen = true;
    const system = park({
      members: [{ id: "a" }],
      fallback: { option: "idle", target: "bench" },
      select: () => [
        ...(dinerOpen ? [{ option: "eat", target: "diner" }] : []),
        { option: "idle", target: "bench" },
      ],
    });
    system.tick(1);
    expect(system.action("a")?.option).toBe("eat");
    expect(system.action("a")?.fallback?.target).toBe("bench");
    dinerOpen = false;
    system.tick(1);
    expect(system.action("a")?.option).toBe("idle");
    expect(system.action("a")?.usedFallback).toBe(true);
  });

  test("a member's own needs, options and selector beat the system's", () => {
    const system = park({
      members: [
        {
          id: "janitor",
          options: [{ id: "patrol", base: 1 }, ...OPTIONS],
          select: () => [{ option: "patrol", target: "pier" }],
        },
      ],
      select: () => [{ option: "eat", target: "diner" }],
    });
    system.tick(1);
    expect(system.action("janitor")?.option).toBe("patrol");
    expect(system.action("janitor")?.target).toBe("pier");
  });

  test("a far member takes no utility pass and no selector call", () => {
    let calls = 0;
    const system = park({
      members: [{ id: "a" }, { id: "b", far: true }],
      select: (view) => {
        calls += 1;
        return [{ option: "eat", target: `${view.id}-diner` }];
      },
    });
    system.tick(1);
    expect(calls).toBe(1);
    expect(system.isFar("b")).toBe(true);
    system.setFar("b", false);
    system.tick(1);
    expect(calls).toBe(3);
    expect(system.action("b")?.option).toBe("eat");
  });

  test("mood reads before the first tick and averages across members", () => {
    const system = park({ members: [{ id: "a" }, { id: "b" }] });
    expect(system.mood("a")?.label).toBeTruthy();
    expect(system.frame("a")).toBeNull();
    system.get("a")!.needs.refill("hunger", -90);
    const mean = system.moodMean()!;
    expect(mean).toBeLessThan(100);
    expect(mean).toBeGreaterThan(0);
  });

  test("the clock supplies now, so a schedule needs no per-tick argument", () => {
    let now = 0;
    const system = createAgentSystem({
      needs: NEEDS,
      options: OPTIONS,
      clock: { now: () => now },
      members: [
        {
          id: "a",
          schedule: {
            cycleSeconds: 100,
            stops: [
              { place: "home", arriveAt: 0, activity: "sleep" },
              { place: "work", arriveAt: 50, activity: "work" },
            ],
            travelSeconds: () => 1,
          },
        },
      ],
    });
    system.tick(1);
    expect(system.frame("a")?.phase?.activity).toBe("sleep");
    now = 60;
    system.tick(1);
    expect(system.frame("a")?.phase?.activity).toBe("work");
    expect(system.frame("a")?.post).toBe("work");
  });

  test("save is plain JSON and load resumes a member instead of starting it fresh", () => {
    const first = park({ members: [{ id: "a" }], select: () => [{ option: "eat", target: "diner" }] });
    first.tick(1);
    first.get("a")!.needs.refill("hunger", -40);
    first.setFar("a", true);
    const state = first.save();
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    expect(state.members.a?.far).toBe(true);

    const second = createAgentSystem({
      needs: NEEDS,
      options: OPTIONS,
      rng: () => 0.5,
      storage: { read: () => state, write: () => {} },
      members: [{ id: "a" }],
      select: () => [{ option: "eat", target: "diner" }],
    });
    expect(second.isFar("a")).toBe(true);
    second.tick(1);
    expect(second.get("a")!.needs.value("hunger")).toBeCloseTo(first.get("a")!.needs.value("hunger"), 5);
  });

  test("storage hydrates on the first tick and is written by save", () => {
    const box: { state: AgentSystemState | undefined } = { state: undefined };
    const storage = { read: () => box.state, write: (next: AgentSystemState) => { box.state = next; } };
    const first = park({ members: [{ id: "a" }], storage, select: () => [{ option: "eat", target: "diner" }] });
    first.tick(1);
    first.save();
    expect(box.state?.members.a).toBeDefined();

    const second = park({ members: [{ id: "a" }], storage, select: () => [{ option: "eat", target: "diner" }] });
    second.tick(1);
    expect(second.action("a")?.option).toBe("eat");
  });

  test("a member saved under an unknown id resumes when it joins later", () => {
    const first = park({ members: [{ id: "guest:1" }], select: () => [{ option: "eat", target: "diner" }] });
    first.tick(1);
    first.get("guest:1")!.needs.refill("fun", -30);
    const state = first.save();

    const second = park({ select: () => [{ option: "eat", target: "diner" }] });
    second.load(state);
    expect(second.size()).toBe(0);
    second.add({ id: "guest:1" });
    second.tick(1);
    expect(second.action("guest:1")?.option).toBe("eat");
    expect(second.get("guest:1")!.needs.value("fun")).toBeCloseTo(60, 5);
  });

  test("remove and dispose drop members and their frames", () => {
    const system = park({ members: [{ id: "a" }, { id: "b" }] });
    system.tick(1);
    system.remove("a");
    expect(system.ids()).toEqual(["b"]);
    expect(system.frame("a")).toBeNull();
    system.dispose();
    expect(system.size()).toBe(0);
    expect(system.moodMean()).toBeNull();
  });
});
