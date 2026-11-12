import { afterEach, beforeEach, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";

import { campaignRecordDigest, campaignSlots, LEGACY_INDEX_KEY, RECORD_SAVE_KEY, recordOfSlot, refreshCampaignSlots, writeCampaignRecord, type CampaignRecord } from "./menuSave";

const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
});
afterEach(() => {
  if (original) Object.defineProperty(globalThis, "localStorage", original);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

const boot = () => createGameContext({ definition: defineGameDefinition({ name: "Campaign records" }), player: { userId: "commander", isNew: true } });
const record: CampaignRecord = { name: "Mara Vell", mission: "The Highland Vale", gold: 340, lumber: 120, playtime: 610, savedAt: 1_700_000_000_000, thumbnail: null };

test("a campaign record writes to its own slot's document and reads back, digest and all", async () => {
  const ctx = boot();
  expect(await writeCampaignRecord(ctx, "campaign-2", record)).toBe(true);
  expect(storage.has(`${RECORD_SAVE_KEY}:campaign-2`)).toBe(true);
  const reloaded = boot();
  expect(await recordOfSlot(reloaded, "campaign-2")).toEqual(record);
  expect(await recordOfSlot(reloaded, "campaign-1")).toBeNull();
  await refreshCampaignSlots(reloaded);
  expect(campaignSlots.mostRecent()).toMatchObject({ id: "campaign-2", name: "Mara Vell", meta: { stores: "340 gold · 120 lumber" } });
  // The digest covers the record section: a reopened slot writes the record that was saved.
  const reopened = boot();
  await writeCampaignRecord(reopened, "campaign-2", (await recordOfSlot(reopened, "campaign-2"))!);
  expect(campaignRecordDigest(reopened, "campaign-2")).toBe(campaignRecordDigest(ctx, "campaign-2"));
});

test("records an older build kept in one index open slot by slot", async () => {
  storage.set(LEGACY_INDEX_KEY, JSON.stringify({ "campaign-1": record, "campaign-3": { ...record, name: "Oren" }, "campaign-2": { name: 5 } }));
  const ctx = boot();
  expect(await recordOfSlot(ctx, "campaign-1")).toEqual(record);
  expect((await recordOfSlot(ctx, "campaign-3"))?.name).toBe("Oren");
  // A damaged entry is no record, not a crash.
  expect(await recordOfSlot(ctx, "campaign-2")).toBeNull();
  await writeCampaignRecord(ctx, "campaign-1", { ...record, gold: 400 });
  expect((await recordOfSlot(boot(), "campaign-1"))?.gold).toBe(400);
  expect((await recordOfSlot(boot(), "campaign-3"))?.name).toBe("Oren");
});
