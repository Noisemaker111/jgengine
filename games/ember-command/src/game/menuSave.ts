import { createSaveSlots } from "@jgengine/core/save/saveSlots";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { requestSceneThumbnail } from "@jgengine/core/scene/sceneCaptureRequest.draw";

import { campaignReadout, campaignStore, resetCampaignProgress, restoreCampaign, setCampaignMode } from "./campaign";
import { campaignSlot, openCampaignSlot, recordOfSlot, writeCampaignRecord, type CampaignRecord } from "./campaignSave";
import { hudStore } from "./hudStore";
import { session } from "./session";
import { openTreasury } from "./treasury";
import { GOLD, LUMBER } from "./tuning";
import { setupSkirmish } from "./world/scene";

/** The three campaign records; the labels are the field desk's own words for them. */
export const CAMPAIGN_SLOTS = ["campaign-1", "campaign-2", "campaign-3"] as const;
export const CAMPAIGN_LABEL: Record<string, string> = { "campaign-1": "Campaign I", "campaign-2": "Campaign II", "campaign-3": "Campaign III" };
export function campaignLabel(slot: string): string {
  return CAMPAIGN_LABEL[slot] ?? slot;
}

/** The commander name the last record carried, so a loaded campaign keeps its commander. */
export const commandProfile: { name: string } = { name: "" };

/** The menu's slot list, filled from the campaign documents' records. */
export const campaignSlots = createSaveSlots({
  capacity: CAMPAIGN_SLOTS.length,
  slots: CAMPAIGN_SLOTS.map((id) => ({ id, empty: true, meta: {} })),
});

/** Refresh the card list from the campaign documents. */
export async function refreshCampaignSlots(ctx: GameContext): Promise<void> {
  for (const slot of CAMPAIGN_SLOTS) {
    const record = await recordOfSlot(ctx, slot);
    if (record === null) { campaignSlots.clear(slot); continue; }
    campaignSlots.write(slot, {
      name: record.name.length > 0 ? record.name : "Commander",
      savedAt: record.savedAt,
      meta: {
        playtime: playtimeLabel(record.playtime),
        mission: record.mission,
        stores: `${record.gold} gold · ${record.lumber} lumber`,
        ...(record.thumbnail === null ? {} : { thumbnail: record.thumbnail }),
      },
    });
  }
}

function playtimeLabel(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : minutes > 0 ? `${minutes}m` : "< 1m";
}

/** Capture the field the record leaves. The shared request waits for the canvas itself. */
export async function captureCampaignThumb(): Promise<string | null> {
  const shot = await requestSceneThumbnail({ width: 320, height: 180 });
  return shot.ok ? shot.thumbnail : null;
}

/** Write the campaign record as it stands: the name, the offered mission and the stores it carries. */
export async function saveCampaignRecord(ctx: GameContext, name?: string): Promise<void> {
  const slot = campaignSlot(ctx);
  const readout = campaignReadout(ctx);
  const gold = Math.floor(ctx.game.economy.balance(ctx.player.userId, GOLD));
  const lumber = Math.floor(ctx.game.economy.balance(ctx.player.userId, LUMBER));
  const previous = await recordOfSlot(ctx, slot);
  const thumbnail = await captureCampaignThumb();
  const record: CampaignRecord = {
    name: name ?? (commandProfile.name.length > 0 ? commandProfile.name : previous?.name ?? "Commander"),
    mission: readout?.title ?? previous?.mission ?? "The Highland Vale",
    gold,
    lumber,
    playtime: (previous?.playtime ?? 0) + Math.max(0, session.elapsed),
    savedAt: Date.now(),
    thumbnail: thumbnail ?? previous?.thumbnail ?? null,
  };
  commandProfile.name = record.name;
  await writeCampaignRecord(ctx, record);
  await refreshCampaignSlots(ctx);
}

/**
 * Open a campaign record: read its document into the campaign track, restage the vale, open the
 * treasury at the stores the record carries, and leave the field desk offering the mission it reached.
 */
export async function loadCampaignRecord(ctx: GameContext, slot: string): Promise<boolean> {
  const record = await recordOfSlot(ctx, slot);
  if (record === null) return false;
  await openCampaignSlot(ctx, slot);
  const progress = campaignStore.read(ctx);
  setupSkirmish(ctx);
  // setupSkirmish opens the vale at its starting purse; the record's own stores are what Continue
  // carries, so the treasury opens at them instead, as the books' opening stockpile.
  openTreasury(ctx, { [GOLD]: record.gold, [LUMBER]: record.lumber });
  campaignStore.write(ctx, progress);
  restoreCampaign(ctx);
  commandProfile.name = record.name;
  hudStore.set({ phase: "ready", gold: record.gold, lumber: record.lumber });
  return true;
}

/** Start a fresh campaign in a slot, carrying the commander's name. */
export async function newCampaignRecord(ctx: GameContext, slot: string, name: string): Promise<void> {
  if (campaignSlot(ctx) !== slot) await openCampaignSlot(ctx, slot);
  setupSkirmish(ctx);
  setCampaignMode(ctx, "campaign");
  resetCampaignProgress(ctx);
  commandProfile.name = name.trim().length > 0 ? name.trim() : "Commander";
  await saveCampaignRecord(ctx, commandProfile.name);
}
