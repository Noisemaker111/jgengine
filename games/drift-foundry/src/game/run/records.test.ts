import { expect, test } from "bun:test";
import { memorySaveBackend, type SaveBackend } from "@jgengine/core/save/saveStore";
import { createFoundrySave, FOUNDRY_ENTRY } from "../foundrySave";
import { completeRun, EMPTY_RECORDS, RECORDS_KEY, readRecords } from "./records";
import { createRunSession } from "./session";

/** The yard's save as a reload reads it: a fresh document over the same backend. */
async function reload(backend: SaveBackend) {
  const save = createFoundrySave(backend);
  await save.load();
  return save;
}

test("finished run records survive constructing a fresh session without overwriting another save", async () => {
  const backend = memorySaveBackend();
  await backend.write("other-game-save", "preserved");
  const run = createRunSession(() => 0, await reload(backend));
  run.start();
  for (let i = 0; i < 300; i++) run.tick(.05, { throttle: 0, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false });
  expect(run.snapshot().phase).toBe("crushed");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(createRunSession(() => 0, await reload(backend)).snapshot().records.attempts).toBe(1);
  expect(await backend.read("other-game-save")).toBe("preserved");
});

test("blocked or corrupt storage remains playable and reports failure honestly", async () => {
  expect(readRecords("broken json")).toEqual(EMPTY_RECORDS);
  const corrupt = memorySaveBackend();
  await corrupt.write(RECORDS_KEY, "broken json");
  expect((await reload(corrupt)).profile.records).toEqual(EMPTY_RECORDS);
  const blocked = memorySaveBackend();
  const save = createFoundrySave({ ...blocked, write: () => Promise.reject(new Error("quota")) });
  expect(await save.write()).toBe(false);
  expect(await blocked.read(FOUNDRY_ENTRY)).toBeNull();
  // A memory-only yard plays the same and says honestly that it kept nothing.
  expect(await createFoundrySave(null).write()).toBe(false);
});

test("only escapes improve personal time; equal millisecond times tie and retain the previous record after reload", async () => {
  const backend = memorySaveBackend();
  const storage = await reload(backend);
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
  storage.profile.records = faster.records;
  expect(await storage.write()).toBe(true);
  expect((await reload(backend)).profile.records).toEqual({ attempts: 5, escapes: 4, bestTime: 44, farthest: 470 });
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
