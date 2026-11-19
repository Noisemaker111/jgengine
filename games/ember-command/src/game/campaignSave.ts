import { isRecord } from "@jgengine/core/data/untyped";
import type { MissionRuntimeSnapshot } from "@jgengine/core/mission/mission";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { createGameSave, type GameSave, type GameSaveSystem } from "@jgengine/core/save/saveDocument";
import { localSaveBackend } from "@jgengine/core/save/saveStore";

import { campaignMissionStore, campaignStore, type CampaignMode, type CampaignProgress } from "./campaign";
import { heroPickStore } from "./heroPicks";

/**
 * The campaign's saves: one shared save document per campaign slot, holding everything a campaign
 * carries between battles. The battlefield itself is restaged fresh on every load, so no world
 * snapshot is kept; what carries is the record the field desk shows (name, mission, the gold and
 * lumber the commander holds), the campaign track, the mission machine and Bram's kit.
 */
export const CAMPAIGN_SAVE_KEY = "ember-command.campaign";
export const SKIRMISH_SLOT = "default";
export const LEGACY_INDEX_KEY = "ember-command.campaigns.v1";
export const LEGACY_WORLD_KEY = "jgengine:save:ember-command";

export interface CampaignRecord {
  name: string;
  mission: string;
  gold: number;
  lumber: number;
  playtime: number;
  savedAt: number;
  thumbnail: string | null;
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const MODES: readonly CampaignMode[] = ["campaign", "skirmish"];

export function readCampaignRecord(value: unknown): CampaignRecord | null {
  if (!isRecord(value)) return null;
  const { name, mission, gold, lumber, playtime, savedAt, thumbnail } = value;
  if (typeof name !== "string" || typeof mission !== "string") return null;
  if (!finite(gold) || !finite(lumber) || !finite(playtime) || !finite(savedAt)) return null;
  return { name, mission, gold, lumber, playtime, savedAt, thumbnail: typeof thumbnail === "string" ? thumbnail : null };
}

export function readCampaignProgress(value: unknown): CampaignProgress | null {
  if (!isRecord(value)) return null;
  const { won, mode, stores } = value;
  if (!Array.isArray(won) || !won.every((id) => typeof id === "string")) return null;
  if (!MODES.includes(mode as CampaignMode) || !isRecord(stores) || !finite(stores["gold"]) || !finite(stores["lumber"])) return null;
  return { won: [...won] as string[], mode: mode as CampaignMode, stores: { gold: stores["gold"], lumber: stores["lumber"] } };
}

function readHeroPicks(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => finite(entry[1])));
}

function liftOldSlot(stored: Readonly<Record<string, string>>, slot: string): Record<string, unknown> {
  const sections: Record<string, unknown> = {};
  const index: unknown = JSON.parse(stored[LEGACY_INDEX_KEY] ?? "null");
  const record = readCampaignRecord(isRecord(index) ? index[slot] : null);
  if (record !== null) sections["record"] = record;
  const world: unknown = JSON.parse(stored[`${LEGACY_WORLD_KEY}:${slot}`] ?? "null");
  const snapshot = isRecord(world) && isRecord(world["value"]) ? world["value"] : world;
  const pairs = isRecord(snapshot) && Array.isArray(snapshot["store"]) ? snapshot["store"] : [];
  const stores = new Map(pairs.filter((pair): pair is [string, unknown] => Array.isArray(pair) && typeof pair[0] === "string"));
  if (stores.has(campaignStore.key)) sections["campaign"] = stores.get(campaignStore.key);
  if (stores.has(campaignMissionStore.key)) sections["mission"] = stores.get(campaignMissionStore.key);
  if (stores.has(heroPickStore.key)) sections["heroPicks"] = stores.get(heroPickStore.key);
  if (Object.keys(sections).length === 0) throw new Error(`ember-command: the old save holds no ${slot}`);
  return sections;
}

interface CampaignDocument {
  readonly save: GameSave;
  record: CampaignRecord | null;
  opened: Promise<unknown>;
}

const documents = perContext(() => new Map<string, CampaignDocument>());

function campaignDocument(ctx: GameContext, slot: string): CampaignDocument {
  const map = documents(ctx);
  const existing = map.get(slot);
  if (existing !== undefined) return existing;
  const state: { record: CampaignRecord | null; opened: Promise<unknown> } = { record: null, opened: Promise.resolve() };
  const systems: GameSaveSystem[] = [
    {
      name: "record",
      snapshot: () => state.record,
      restore: (value) => { state.record = readCampaignRecord(value); },
      reset: () => { state.record = null; },
    },
    {
      name: "campaign",
      snapshot: () => campaignStore.read(ctx),
      restore: (value) => {
        const progress = readCampaignProgress(value);
        if (progress === null) campaignStore.clear(ctx);
        else campaignStore.write(ctx, progress);
      },
      reset: () => campaignStore.clear(ctx),
    },
    {
      name: "mission",
      snapshot: () => campaignMissionStore.read(ctx),
      // The mission machine checks its own snapshot when the campaign restores it.
      restore: (value) => { if (isRecord(value)) campaignMissionStore.write(ctx, value as unknown as MissionRuntimeSnapshot); else campaignMissionStore.clear(ctx); },
      reset: () => campaignMissionStore.clear(ctx),
    },
    {
      name: "heroPicks",
      snapshot: () => heroPickStore.read(ctx),
      restore: (value) => heroPickStore.write(ctx, readHeroPicks(value)),
      reset: () => heroPickStore.clear(ctx),
    },
  ];
  const save = createGameSave({
    backend: localSaveBackend(),
    game: "ember-command",
    key: CAMPAIGN_SAVE_KEY,
    slot,
    systems,
    legacy: { keys: (legacySlot) => [LEGACY_INDEX_KEY, `${LEGACY_WORLD_KEY}:${legacySlot}`], lift: liftOldSlot },
  });
  const created: CampaignDocument = Object.assign(state, { save });
  map.set(slot, created);
  return created;
}

const active = perContext(() => ({ slot: SKIRMISH_SLOT }));

export function campaignSlot(ctx: GameContext): string {
  return active(ctx).slot;
}

export async function openCampaignSlot(ctx: GameContext, slot: string): Promise<boolean> {
  active(ctx).slot = slot;
  const document = campaignDocument(ctx, slot);
  const held = (await document.save.peek(slot)) !== null;
  const opening = document.save.load();
  document.opened = opening.catch(() => undefined);
  await opening;
  return held;
}

export async function campaignHeld(ctx: GameContext, slot: string): Promise<boolean> {
  return (await campaignDocument(ctx, slot).save.peek(slot)) !== null;
}

export async function recordOfSlot(ctx: GameContext, slot: string): Promise<CampaignRecord | null> {
  const read = await campaignDocument(ctx, slot).save.peek(slot);
  return read.kind === "loaded" ? readCampaignRecord(read.value.systems["record"]) : null;
}

export async function saveCampaign(ctx: GameContext): Promise<boolean> {
  const document = campaignDocument(ctx, campaignSlot(ctx));
  // A write never lands before the slot's own read, so it cannot replace a stored campaign.
  await document.opened;
  await document.save.save();
  return document.save.status() === "saved";
}

export async function writeCampaignRecord(ctx: GameContext, record: CampaignRecord): Promise<boolean> {
  campaignDocument(ctx, campaignSlot(ctx)).record = record;
  return saveCampaign(ctx);
}

export function campaignDigest(ctx: GameContext): string {
  return campaignDocument(ctx, campaignSlot(ctx)).save.digest();
}
