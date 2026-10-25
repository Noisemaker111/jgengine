import { expect, test } from "bun:test";
import { createRunSession } from "./session";
import { PROGRESS_KEY, readParkedRun } from "./progress";
import type { RecordStorage } from "./records";

function storage(): RecordStorage {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

test("a real parked run reloads its accepted build and clock once; New Run clears it", () => {
  const saved = storage();
  const first = createRunSession(undefined, saved);
  first.start();
  for (let frame = 0; frame < 240 && first.snapshot().collectedIds.size === 0; frame++) first.tick(1 / 30, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false });
  expect(first.snapshot().installed.engine?.id).toBe("salvage_v6");
  first.togglePause();
  // A pause while moving does not write a parked physics state, but the autosave the pickup already
  // wrote is still there: that is the state a reload resumes.
  expect(readParkedRun(saved)).not.toBeNull();
  first.togglePause();
  for (let frame = 0; frame < 180 && first.snapshot().pose.speedKmh > 0.1; frame++) first.tick(1 / 30, { throttle: 0, brake: first.snapshot().pose.speedKmh > 1 ? 1 : 0, steer: 0 }, { jumpPressed: false, plowBracing: false });
  first.togglePause();
  const parked = first.snapshot();
  expect(parked.parkedRun).not.toBeNull();
  const second = createRunSession(undefined, saved);
  expect(second.snapshot().phase).toBe("start");
  second.start();
  const restored = second.snapshot();
  expect(restored.pose.position).toEqual(parked.pose.position);
  expect(restored.pose.speedKmh).toBe(0);
  expect(restored.runTime).toBe(parked.runTime);
  expect(restored.compactorZ).toBe(parked.compactorZ);
  expect(restored.collectedIds).toEqual(parked.collectedIds);
  expect(restored.installed.engine?.id).toBe(parked.installed.engine?.id);
  expect(restored.records.attempts).toBe(0);
  expect(restored.ticker).toHaveLength(1); // Hydration does not replay pickup grants or radio.
  second.start();
  expect(second.snapshot().ticker).toHaveLength(1);
  second.restart();
  expect(readParkedRun(saved)).toBeNull();
  expect(second.snapshot().collectedIds.size).toBe(0);
});

test("corrupt or future checkpoint payloads cannot install parts", () => {
  const saved = storage();
  for (const value of ["{", JSON.stringify({ version: 2 }), JSON.stringify({ version: 1, position: [Infinity, 0, 18] })]) {
    saved.setItem(PROGRESS_KEY, value);
    expect(readParkedRun(saved)).toBeNull();
  }
});
