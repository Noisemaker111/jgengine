import { expect, test } from "bun:test";
import { memorySaveBackend, type SaveBackend } from "@jgengine/core/save/saveStore";
import { createFoundrySave } from "../foundrySave";
import { createRunSession } from "./session";
import { PROGRESS_KEY, readParkedRun } from "./progress";

/** Writes land asynchronously; let the ones the session started settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The yard's save as a reload reads it: a fresh document over the same backend. */
async function reload(backend: SaveBackend) {
  const save = createFoundrySave(backend);
  await save.load();
  return save;
}

test("a real parked run reloads its accepted build and clock once; New Run clears it", async () => {
  const backend = memorySaveBackend();
  const saved = await reload(backend);
  const first = createRunSession(undefined, saved);
  first.start();
  for (let frame = 0; frame < 240 && first.snapshot().collectedIds.size === 0; frame++) first.tick(1 / 30, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false });
  expect(first.snapshot().installed.engine?.id).toBe("salvage_v6");
  first.togglePause();
  // A pause while moving does not write a parked physics state, but the autosave the pickup already
  // wrote is still there: that is the state a reload resumes.
  await settle();
  expect((await saved.peek())!.parked).not.toBeNull();
  first.togglePause();
  for (let frame = 0; frame < 180 && first.snapshot().pose.speedKmh > 0.1; frame++) first.tick(1 / 30, { throttle: 0, brake: first.snapshot().pose.speedKmh > 1 ? 1 : 0, steer: 0 }, { jumpPressed: false, plowBracing: false });
  first.togglePause();
  const parked = first.snapshot();
  expect(parked.parkedRun).not.toBeNull();
  await settle();
  const reloaded = await reload(backend);
  // The document's digest covers every section: the reloaded yard writes the state that was saved.
  expect(reloaded.digest()).toBe(saved.digest());
  const second = createRunSession(undefined, reloaded);
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
  await settle();
  expect((await reloaded.peek())!.parked).toBeNull();
  expect(second.snapshot().collectedIds.size).toBe(0);
});

test("corrupt or future checkpoint payloads cannot install parts", async () => {
  for (const value of [JSON.stringify({ version: 2 }), JSON.stringify({ version: 1, position: [Infinity, 0, 18] })]) {
    expect(readParkedRun(JSON.parse(value))).toBeNull();
  }
  // Unreadable bytes an older build left at its own key lift into an empty parked section.
  const backend = memorySaveBackend();
  await backend.write(PROGRESS_KEY, "{");
  expect((await reload(backend)).profile.parked).toBeNull();
});
