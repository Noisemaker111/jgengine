import { isRecord } from "@jgengine/core/data/untyped";
import { createGameSave, type GameSave } from "@jgengine/core/save/saveDocument";
import { createSaveSlots } from "@jgengine/core/save/saveSlots";
import { localSaveBackend } from "@jgengine/core/save/saveStore";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { requestSceneThumbnail } from "@jgengine/core/scene/sceneCaptureRequest.draw";

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
/** The campaign record documents: one shared save document per slot, its `record` section the card. */
export const RECORD_SAVE_KEY = "ember-command.campaign";
/** Where an older build kept every slot's record in one index; each slot lifts its own entry. */
export const LEGACY_INDEX_KEY = "ember-command.campaigns.v1";

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** A stored `record` section, field by field; `null` when it is not a record this build can show. */
export function readCampaignRecord(value: unknown): CampaignRecord | null {
  if (!isRecord(value)) return null;
  const { name, mission, gold, lumber, playtime, savedAt, thumbnail } = value;
  if (typeof name !== "string" || typeof mission !== "string") return null;
  if (!finite(gold) || !finite(lumber) || !finite(playtime) || !finite(savedAt)) return null;
  return { name, mission, gold, lumber, playtime, savedAt, thumbnail: typeof thumbnail === "string" ? thumbnail : null };
}

/** One slot's record document, and the record the next write carries. */
interface RecordDocument {
  readonly save: GameSave;
  record: CampaignRecord | null;
}

/** An older build's index entry for this slot becomes its `record` section. */
function liftIndexEntry(stored: Readonly<Record<string, string>>, slot: string): Record<string, unknown> {
  const index: unknown = JSON.parse(stored[LEGACY_INDEX_KEY] ?? "null");
  const record = readCampaignRecord(isRecord(index) ? index[slot] : null);
  if (record === null) throw new Error(`ember-command: the old record index holds no ${slot}`);
  return { record };
}

const recordDocuments = perContext(() => new Map<string, RecordDocument>());

function recordDocument(ctx: GameContext, slot: string): RecordDocument {
  const documents = recordDocuments(ctx);
  const existing = documents.get(slot);
  if (existing !== undefined) return existing;
  const state: { record: CampaignRecord | null } = { record: null };
  const save = createGameSave({
    backend: localSaveBackend(undefined, { errorMode: "throw" }),
    game: "ember-command",
    key: RECORD_SAVE_KEY,
    slot,
    systems: [{
      name: "record",
      snapshot: () => state.record,
      restore: (value) => { state.record = readCampaignRecord(value); },
      reset: () => { state.record = null; },
    }],
    legacy: { keys: () => [LEGACY_INDEX_KEY], lift: liftIndexEntry },
  });
  const created: RecordDocument = Object.assign(state, { save });
  documents.set(slot, created);
  return created;
}

export function campaignLabel(slot: string): string {
  return CAMPAIGN_LABEL[slot] ?? slot;
}

/** The commander name the last record carried, so a loaded campaign keeps its commander. */
export const commandProfile: { name: string } = { name: "" };

/** The menu's slot list, filled from the record documents. */
export const campaignSlots = createSaveSlots({
  capacity: CAMPAIGN_SLOTS.length,
  slots: CAMPAIGN_SLOTS.map((id) => ({ id, empty: true, meta: {} })),
});

/**
 * A slot's campaign record: the name, mission and stores the field desk shows. `ctx.game.save` (the
 * whole-world save) cannot `peek` another slot, so each slot's record is its own shared save
 * document, read without touching the live campaign.
 */
export async function recordOfSlot(ctx: GameContext, slot: string): Promise<CampaignRecord | null> {
  const document = await recordDocument(ctx, slot).save.peek(slot);
  return document === null ? null : readCampaignRecord(document.systems["record"]);
}

/** The state digest of a slot's record document, for a restore test or a diff. */
export function campaignRecordDigest(ctx: GameContext, slot: string): string {
  return recordDocument(ctx, slot).save.digest();
}

/** Refresh the card list from the record documents. */
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
  const slot = ctx.game.save?.slot() ?? CAMPAIGN_SLOTS[0];
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
  await writeCampaignRecord(ctx, slot, record);
  await refreshCampaignSlots(ctx);
  await ctx.game.save?.save();
}

/** Write a slot's record document; false when this browser could not keep it. */
export async function writeCampaignRecord(ctx: GameContext, slot: string, record: CampaignRecord): Promise<boolean> {
  const document = recordDocument(ctx, slot);
  document.record = record;
  await document.save.save();
  return document.save.status() === "saved";
}

/**
 * Open a campaign record: load the world, restage the vale, put the saved stores and track back,
 * and leave the field desk offering the mission it reached.
 */
export async function loadCampaignRecord(ctx: GameContext, slot: string): Promise<boolean> {
  const save = ctx.game.save;
  if (save === undefined) return false;
  if (save.slot() !== slot && !(await save.switchSlot(slot))) return false;
  const record = await recordOfSlot(ctx, slot);
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
