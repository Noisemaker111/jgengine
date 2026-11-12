import { expect, test } from "bun:test";
import { memorySaveBackend } from "@jgengine/core/save/saveStore";

import { CAREER_KEY, newCareer } from "./career";
import { createFoundrySave, FOUNDRY_ENTRY, PIT_FRAME_KEY } from "./foundrySave";
import { GHOST_KEY } from "./run/ghost";
import { RECORDS_KEY } from "./run/records";
import { RUN_STATE_KEY } from "./run/shiftState";

test("a yard an older build kept under six keys opens as one document with one digest", async () => {
  const career = { ...newCareer(), bank: { banked: 640, haul: 0, deposited: 640, lost: 0, bestHaul: 120, runs: 4 } };
  const records = { attempts: 4, escapes: 2, bestTime: 41.5, farthest: 470 };
  const ghosts = { "time-sheet": { time: 30, frames: [[0, 0, 0, 0, 0], [1, 0, 0, 10, 0]] } };
  const backend = memorySaveBackend();
  await backend.write(CAREER_KEY, JSON.stringify(career));
  await backend.write(RECORDS_KEY, JSON.stringify(records));
  await backend.write(RUN_STATE_KEY, JSON.stringify({ session: 4, closed: 4, carried: 0, optionId: "hobbs-line" }));
  await backend.write(GHOST_KEY, JSON.stringify(ghosts));
  await backend.write(PIT_FRAME_KEY, JSON.stringify({ thumbnail: null, savedAt: 5 }));

  const yard = createFoundrySave(backend);
  expect(await yard.peek()).not.toBeNull();
  await yard.load();
  expect(yard.profile.records).toEqual(records);
  expect(yard.profile.career.bank).toEqual(career.bank);
  expect(yard.profile.run).toEqual({ session: 4, closed: 4, carried: 0, optionId: "hobbs-line" });
  expect(yard.profile.ghosts).toEqual(ghosts);
  expect(yard.profile.parked).toBeNull();
  expect(yard.profile.pitFrame.savedAt).toBe(5);

  // The first write is the document; a fresh read of it restores the same state, digest and all.
  expect(await yard.write()).toBe(true);
  expect(Object.keys(JSON.parse((await backend.read(FOUNDRY_ENTRY))!).value.systems).sort()).toEqual(["career", "ghosts", "parked", "pitFrame", "records", "run"]);
  const reloaded = createFoundrySave(backend);
  await reloaded.load();
  expect(reloaded.profile).toEqual(yard.profile);
  expect(reloaded.digest()).toBe(yard.digest());
});
