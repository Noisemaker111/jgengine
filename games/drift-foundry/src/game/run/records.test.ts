import { expect, test } from "bun:test";
import { completeRun, EMPTY_RECORDS, readRecords, saveRecords } from "./records";
import { createRunSession } from "./session";

test("finished run records survive constructing a fresh session without overwriting another save", () => {
  const data = new Map([["other-game-save", "preserved"]]);
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const run = createRunSession(() => 0, storage);
  run.start();
  for (let i = 0; i < 300; i++) run.tick(.05, { throttle: 0, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false });
  expect(run.snapshot().phase).toBe("crushed");
  expect(createRunSession(() => 0, storage).snapshot().records.attempts).toBe(1);
  expect(data.get("other-game-save")).toBe("preserved");
});

test("blocked or corrupt storage remains playable and reports failure honestly", () => {
  const bad = { getItem: () => "broken json", setItem: () => { throw new Error("quota"); } };
  expect(readRecords(bad)).toEqual(EMPTY_RECORDS);
  expect(saveRecords(EMPTY_RECORDS, bad)).toBe(false);
});

test("only escapes improve personal time; equal millisecond times tie and retain the previous record after reload", () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const first = completeRun(EMPTY_RECORDS, { kind: "won", time: 45.1231, distance: 470 });
  expect(first.personalBest).toBe("first");
  const crushed = completeRun(first.records, { kind: "crushed", time: 12, distance: 150 });
  expect(crushed.records.bestTime).toBe(45.123);
  expect(crushed.records.escapes).toBe(1);
  const tied = completeRun(crushed.records, { kind: "won", time: 45.1233, distance: 470 });
  expect(tied.personalBest).toBe("tied");
  const slower = completeRun(tied.records, { kind: "won", time: 48, distance: 470 });
  expect(slower.personalBest).toBe("unchanged");
  const faster = completeRun(slower.records, { kind: "won", time: 44, distance: 470 });
  expect(faster.personalBest).toBe("improved");
  expect(saveRecords(faster.records, storage)).toBe(true);
  expect(readRecords(storage)).toEqual({ attempts: 5, escapes: 4, bestTime: 44, farthest: 470 });
  expect(completeRun(faster.records, { kind: "won", time: NaN, distance: 470 }).records).toBe(faster.records);
});

test("pause and settings suspension freeze both the car and crusher, including a large resume delta", () => {
  const run = createRunSession();
  run.start();
  run.tick(.05, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false });
  const before = run.snapshot();
  run.togglePause();
  run.tick(12, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: true, plowBracing: false });
  expect(run.snapshot().pose).toEqual(before.pose);
  expect(run.snapshot().compactorZ).toBe(before.compactorZ);
  run.togglePause();
  run.suspend(true);
  run.tick(12, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: true, plowBracing: false });
  expect(run.snapshot().runTime).toBe(before.runTime);
  run.suspend(false);
  run.tick(12, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false });
  expect(run.snapshot().runTime).toBeCloseTo(before.runTime + .05);
});
