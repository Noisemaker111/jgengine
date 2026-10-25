import { expect, test } from "bun:test";

import { foundrySlots, PIT_FRAME_KEY, refreshFoundrySlots } from "./menuSave";
import { PROGRESS_KEY, saveParkedRun, type ParkedRun } from "./run/progress";
import type { RecordStorage } from "./run/records";

function memory(): { storage: RecordStorage; values: Map<string, string> } {
  const values = new Map<string, string>();
  return { values, storage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } } };
}

const parked: ParkedRun = {
  version: 1,
  position: [0, 0, 64],
  heading: 0,
  runTime: 11.7,
  partIds: [],
  collectedIds: [],
  gateIds: [],
  armorSaveArmed: false,
  armorSavesUsed: 0,
  nearMissCount: 0,
  closestGap: 0,
  wasNear: false,
  announcedSurge: null,
};

test("the Continue card is the parked run, in the yard's words", () => {
  const { storage, values } = memory();
  expect(saveParkedRun(parked, storage)).toBe(true);
  values.set(PIT_FRAME_KEY, JSON.stringify({ thumbnail: "data:image/jpeg;base64,AAAA", savedAt: 1_700_000_000_000 }));

  refreshFoundrySlots(storage);
  const card = foundrySlots.mostRecent();
  expect(card?.name).toBe("Parked at 64 m");
  expect(card?.savedAt).toBe(1_700_000_000_000);
  expect(card?.meta).toMatchObject({
    clock: "11.7 s",
    build: "0 of 4 parts",
    gate: "13% of Row Six",
    credits: "0 cr",
    thumbnail: "data:image/jpeg;base64,AAAA",
  });
});

test("with no parked run the card list is empty, so Continue has nothing to resume", () => {
  const { storage } = memory();
  refreshFoundrySlots(storage);
  expect(foundrySlots.mostRecent()).toBeNull();
});

test("a moving or missing buggy never becomes a card", () => {
  const { storage, values } = memory();
  // A run with no time on the clock is not a checkpoint, however it reached storage.
  values.set(PROGRESS_KEY, JSON.stringify({ ...parked, runTime: 0 }));
  refreshFoundrySlots(storage);
  expect(foundrySlots.mostRecent()).toBeNull();
});
