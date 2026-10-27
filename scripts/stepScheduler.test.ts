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

  test("a step in flight is told to stop when another fails, and is not counted as a failure", async () => {
    const steps: ScheduledStep[] = [{ name: "slow tests", cost: 90 }, { name: "types", first: true }];
    const results = await runSteps(
      steps,
      2,
      async (step, signal) => {
        if (step.name === "types") {
          await pause(5);
          return done(step.name, false);
        }
        await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
        return { name: step.name, ok: false, ms: 0, output: "stopped", stopped: true };
      },
      { failFast: true },
    );
    expect(results.find((result) => result.name === "slow tests")).toMatchObject({ ok: false, stopped: true });
    expect(results.find((result) => result.name === "types")).toMatchObject({ ok: false });
  });

  test("a first step is never handed a signal that aborts", async () => {
    const aborted: boolean[] = [];
    const steps: ScheduledStep[] = [{ name: "a", first: true }, { name: "b", first: true }];
    await runSteps(
      steps,
      2,
      async (step, signal) => {
        if (step.name === "b") await pause(10);
        aborted.push(signal.aborted);
        return done(step.name, step.name !== "a");
      },
      { failFast: true },
    );
    expect(aborted).toEqual([false, false]);
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
