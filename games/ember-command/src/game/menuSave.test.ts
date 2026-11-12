import { afterEach, beforeEach, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";

import { game } from "../game.config";
import { CAMPAIGN, campaignStore, campaignMissionStore } from "./campaign";
import {
  CAMPAIGN_SAVE_KEY,
  campaignDigest,
  campaignSlot,
  LEGACY_INDEX_KEY,
  LEGACY_WORLD_KEY,
  openCampaignSlot,
  recordOfSlot,
  writeCampaignRecord,
  type CampaignRecord,
} from "./campaignSave";
import { content } from "./content";
import { heroPickStore } from "./heroPicks";
import { CAMPAIGN_SLOTS, campaignSlots, commandProfile, loadCampaignRecord, refreshCampaignSlots } from "./menuSave";
import { treasuryBooks } from "./treasury";
import { GOLD, LUMBER } from "./tuning";

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
  // The commander name and the card list are module state the menu tests read after this file.
  commandProfile.name = "";
  for (const slot of CAMPAIGN_SLOTS) campaignSlots.clear(slot);
  if (original) Object.defineProperty(globalThis, "localStorage", original);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

const boot = () => createGameContext({ definition: game.game, content, player: { userId: "commander", isNew: true } });
const record: CampaignRecord = { name: "Mara Vell", mission: "The Highland Vale", gold: 340, lumber: 120, playtime: 610, savedAt: 1_700_000_000_000, thumbnail: null };
const won = [CAMPAIGN[0]!.mission.id];
const progress = { won, mode: "campaign" as const, stores: { gold: 120, lumber: 40 } };

/** Continue opens the record: its track and kit come back, and the treasury opens at its stores. */
async function expectContinued(slot: string): Promise<void> {
  const ctx = boot();
  expect(await loadCampaignRecord(ctx, slot)).toBe(true);
  expect(campaignSlot(ctx)).toBe(slot);
  expect(campaignStore.read(ctx)).toEqual(progress);
  expect(heroPickStore.read(ctx)).toEqual({ "volley": 1 });
  expect(ctx.game.economy.balance(ctx.player.userId, GOLD)).toBe(record.gold);
  expect(ctx.game.economy.balance(ctx.player.userId, LUMBER)).toBe(record.lumber);
  // The stores open as the books' stockpile: no write behind the treasury's back to reconcile.
  const reasons = new Set(treasuryBooks(ctx).entries().map((entry) => entry.reason));
  expect([...reasons]).toEqual(["starting-stockpile"]);
}

test("a campaign writes to its slot's document and Continue brings back its track, kit and stores", async () => {
  const ctx = boot();
  await openCampaignSlot(ctx, "campaign-2");
  campaignStore.write(ctx, progress);
  heroPickStore.write(ctx, { "volley": 1 });
  expect(await writeCampaignRecord(ctx, record)).toBe(true);
  expect(storage.has(`${CAMPAIGN_SAVE_KEY}:campaign-2`)).toBe(true);
  // No whole-world save is written beside it.
  expect([...storage.keys()].some((key) => key.startsWith(LEGACY_WORLD_KEY))).toBe(false);

  const reader = boot();
  expect(await recordOfSlot(reader, "campaign-2")).toEqual(record);
  expect(await recordOfSlot(reader, "campaign-1")).toBeNull();
  await refreshCampaignSlots(reader);
  expect(campaignSlots.mostRecent()).toMatchObject({ id: "campaign-2", name: "Mara Vell", meta: { stores: "340 gold · 120 lumber" } });
  await expectContinued("campaign-2");

  // The digest covers every section: a reopened slot writes the state that was saved.
  const reopened = boot();
  await openCampaignSlot(reopened, "campaign-2");
  expect(campaignDigest(reopened)).toBe(campaignDigest(ctx));
});

test("a campaign an older build kept in its record index and whole-world save still continues", async () => {
  storage.set(LEGACY_INDEX_KEY, JSON.stringify({ "campaign-1": record, "campaign-3": { ...record, name: "Oren" }, "campaign-2": { name: 5 } }));
  const world = { entities: [], store: [[campaignStore.key, progress], [heroPickStore.key, { "volley": 1 }], [campaignMissionStore.key, null]], economy: {} };
  storage.set(`${LEGACY_WORLD_KEY}:campaign-1`, JSON.stringify({ version: 1, savedAt: 5, value: world }));
  const ctx = boot();
  expect(await recordOfSlot(ctx, "campaign-1")).toEqual(record);
  expect((await recordOfSlot(ctx, "campaign-3"))?.name).toBe("Oren");
  // A damaged index entry is no record, not a crash.
  expect(await recordOfSlot(ctx, "campaign-2")).toBeNull();
  await expectContinued("campaign-1");
});
