import { describe, expect, test } from "bun:test";

import { runSteps, type ScheduledStep, type StepResult } from "./stepScheduler";

const done = (name: string, ok = true): StepResult => ({ name, ok, ms: 0, output: "" });
const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("first steps", () => {
  test("a first step starts before a heavier step without the flag", async () => {
    const order: string[] = [];
    const steps: ScheduledStep[] = [
      { name: "tests", cost: 90 },
      { name: "types", cost: 12, first: true },
    ];
    await runSteps(steps, 1, async (step) => {
      order.push(step.name);
      return done(step.name);
    });
    expect(order).toEqual(["types", "tests"]);
  });
});

describe("fail fast", () => {
  test("a failing first step stops every later step that is not first", async () => {
    const ran: string[] = [];
    const steps: ScheduledStep[] = [
      { name: "types", first: true },
      { name: "tests a", cost: 30 },
      { name: "tests b", cost: 30 },
    ];
    const results = await runSteps(
      steps,
      1,
      async (step) => {
        ran.push(step.name);
        return done(step.name, step.name !== "types");
      },
      { failFast: true },
    );
    expect(ran).toEqual(["types"]);
    expect(results.map((result) => [result.name, result.ok, result.blockedBy])).toEqual([
      ["types", false, undefined],
      ["tests a", false, ["types"]],
      ["tests b", false, ["types"]],
    ]);
  });

  test("the other first steps still run, so every type error shows in one run", async () => {
    const ran: string[] = [];
    const steps: ScheduledStep[] = [
      { name: "types core", first: true },
      { name: "types game", first: true },
      { name: "tests", cost: 30 },
    ];
    await runSteps(
      steps,
      1,
      async (step) => {
        ran.push(step.name);
        return done(step.name, false);
      },
      { failFast: true },
    );
    expect(ran).toEqual(["types core", "types game"]);
  });

  test("a step already running when another fails runs to the end and keeps its result, while queued ones never start", async () => {
    const ran: string[] = [];
    const steps: ScheduledStep[] = [
      { name: "tests a", cost: 90 },
      { name: "tests b", cost: 80 },
      { name: "tests c", cost: 10 },
    ];
    const results = await runSteps(
      steps,
      2,
      async (step) => {
        ran.push(step.name);
        if (step.name === "tests b") return done(step.name, false);
        await pause(20);
        return done(step.name);
      },
      { failFast: true },
    );
    expect(ran).toEqual(["tests a", "tests b"]);
    expect(results.map((result) => [result.name, result.ok, result.blockedBy])).toEqual([
      ["tests a", true, undefined],
      ["tests b", false, undefined],
      ["tests c", false, ["tests b"]],
    ]);
  });

  test("without fail fast, a failure leaves its neighbours to finish", async () => {
    const ran: string[] = [];
    await runSteps([{ name: "a", first: true }, { name: "b" }], 1, async (step) => {
      ran.push(step.name);
      return done(step.name, step.name !== "a");
    });
    expect(ran).toEqual(["a", "b"]);
  });
});
