import { createSaveSlots } from "@jgengine/core/game/saveSlots";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { requestSceneThumbnail } from "@jgengine/shell/render/sceneCaptureRequest";

import { campaignReadout, campaignStore, resetCampaignProgress, restoreCampaign, setCampaignMode } from "./campaign";
import { hudStore } from "./hudStore";
import { session } from "./session";
import { GOLD, LUMBER } from "./tuning";
import { setupSkirmish } from "./world/scene";

/** The three campaign records; the labels are the field desk's own words for them. */
export const CAMPAIGN_SLOTS = ["campaign-1", "campaign-2", "campaign-3"] as const;
export const CAMPAIGN_LABEL: Record<string, string> = { "campaign-1": "Campaign I", "campaign-2": "Campaign II", "campaign-3": "Campaign III" };
/** What a campaign record remembers between battles. */
export interface CampaignRecord {
  name: string;
  mission: string;
  gold: number;
  lumber: number;
  playtime: number;
  savedAt: number;
  thumbnail: string | null;
}
const INDEX_KEY = "ember-command.campaigns.v1";

export function campaignLabel(slot: string): string {
  return CAMPAIGN_LABEL[slot] ?? slot;
}

/** The commander name the last record carried, so a loaded campaign keeps its commander. */
export const commandProfile: { name: string } = { name: "" };

/** The menu's slot list, filled from the sidecar below. */
export const campaignSlots = createSaveSlots({
  capacity: CAMPAIGN_SLOTS.length,
  slots: CAMPAIGN_SLOTS.map((id) => ({ id, empty: true, meta: {} })),
});

function readIndex(): Record<string, CampaignRecord> {
  try {
    const parsed = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "null") as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, CampaignRecord>) : {};
  } catch {
    return {};
  }
}

function writeIndex(records: Record<string, CampaignRecord>): void {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(records)); } catch { /* a full profile still plays this session */ }
}

/**
 * The campaign's display sidecar. `ctx.game.save` (the game's whole-world save path) restores a
 * record but exposes no `peek(slot)`, so the field desk cannot read another slot's name, mission or
 * stores from it. This index is the smallest stand-in: one entry per slot, written with each save.
 * Remove it when RuntimeSave can answer `peek` like GameSave does.
 */
export function recordOfSlot(slot: string): CampaignRecord | null {
  return readIndex()[slot] ?? null;
}

/** Refresh the card list from the sidecar. */
export function refreshCampaignSlots(): void {
  const records = readIndex();
  for (const slot of CAMPAIGN_SLOTS) {
    const record = records[slot];
    if (record === undefined) { campaignSlots.clear(slot); continue; }
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
  const slot = ctx.game.save?.slot() ?? CAMPAIGN_SLOTS[0];
  const readout = campaignReadout(ctx);
  const previous = recordOfSlot(slot);
  const gold = Math.floor(ctx.game.economy.balance(ctx.player.userId, GOLD));
  const lumber = Math.floor(ctx.game.economy.balance(ctx.player.userId, LUMBER));
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
  const index = readIndex();
  index[slot] = record;
  writeIndex(index);
  refreshCampaignSlots();
  await ctx.game.save?.save();
}

/**
 * Open a campaign record: load the world, restage the vale, put the saved stores and track back,
 * and leave the field desk offering the mission it reached.
 */
export async function loadCampaignRecord(ctx: GameContext, slot: string): Promise<boolean> {
  const save = ctx.game.save;
  if (save === undefined) return false;
  if (save.slot() !== slot && !(await save.switchSlot(slot))) return false;
  const record = recordOfSlot(slot);
  if (record === null) return false;
  const gold = ctx.game.economy.balance(ctx.player.userId, GOLD);
  const lumber = ctx.game.economy.balance(ctx.player.userId, LUMBER);
  const progress = campaignStore.read(ctx);
  setupSkirmish(ctx);
  // setupSkirmish opens the vale at its starting purse; the record's own stores are what Continue
  // carries, so they replace that opening purse exactly.
  ctx.game.economy.charge(ctx.player.userId, GOLD, ctx.game.economy.balance(ctx.player.userId, GOLD));
  ctx.game.economy.charge(ctx.player.userId, LUMBER, ctx.game.economy.balance(ctx.player.userId, LUMBER));
  if (gold > 0) ctx.game.economy.grant(ctx.player.userId, GOLD, gold);
  if (lumber > 0) ctx.game.economy.grant(ctx.player.userId, LUMBER, lumber);
  campaignStore.write(ctx, progress);
  restoreCampaign(ctx);
  commandProfile.name = record.name;
  hudStore.set({ phase: "ready", gold, lumber });
  return true;
}

/** Start a fresh campaign in a slot, carrying the commander's name. */
export async function newCampaignRecord(ctx: GameContext, slot: string, name: string): Promise<void> {
  const save = ctx.game.save;
  if (save === undefined) return;
  if (save.slot() !== slot) await save.switchSlot(slot);
  setupSkirmish(ctx);
  setCampaignMode(ctx, "campaign");
  resetCampaignProgress(ctx);
  commandProfile.name = name.trim().length > 0 ? name.trim() : "Commander";
  await saveCampaignRecord(ctx, commandProfile.name);
}
