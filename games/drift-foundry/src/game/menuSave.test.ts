import { expect, test } from "bun:test";
import { memorySaveBackend } from "@jgengine/core/save/saveStore";

import { createFoundrySave, PIT_FRAME_KEY } from "./foundrySave";
import { foundrySlots, refreshFoundrySlots } from "./menuSave";
import { PROGRESS_KEY, type ParkedRun } from "./run/progress";

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

const card = { thumbnail: "data:image/jpeg;base64,AAAA", savedAt: 1_700_000_000_000 };

test("the Continue card is the parked run, in the yard's words", async () => {
  const save = createFoundrySave(memorySaveBackend(), { parked, pitFrame: card });
  expect(await save.write()).toBe(true);

  await refreshFoundrySlots(save);
  const recent = foundrySlots.mostRecent();
  expect(recent?.name).toBe("Parked at 64 m");
  expect(recent?.savedAt).toBe(1_700_000_000_000);
  expect(recent?.meta).toMatchObject({
    clock: "11.7 s",
    build: "0 of 4 parts",
    gate: "13% of Row Six",
    credits: "0 cr",
    thumbnail: "data:image/jpeg;base64,AAAA",
  });
});

test("a buggy an older build parked at its own keys is still the Continue card", async () => {
  const backend = memorySaveBackend();
  await backend.write(PROGRESS_KEY, JSON.stringify(parked));
  await backend.write(PIT_FRAME_KEY, JSON.stringify(card));
  await refreshFoundrySlots(createFoundrySave(backend));
  expect(foundrySlots.mostRecent()?.name).toBe("Parked at 64 m");
  expect(foundrySlots.mostRecent()?.savedAt).toBe(1_700_000_000_000);
});

test("with no parked run the card list is empty, so Continue has nothing to resume", async () => {
  await refreshFoundrySlots(createFoundrySave(memorySaveBackend()));
  expect(foundrySlots.mostRecent()).toBeNull();
});

test("a moving or missing buggy never becomes a card", async () => {
  // A run with no time on the clock is not a checkpoint, however it reached storage.
  const backend = memorySaveBackend();
  await backend.write(PROGRESS_KEY, JSON.stringify({ ...parked, runTime: 0 }));
  await refreshFoundrySlots(createFoundrySave(backend));
  expect(foundrySlots.mostRecent()).toBeNull();
});
