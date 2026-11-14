import { createGameSave, GAME_SAVE_VERSION, type GameSave, type GameSaveDocument, type GameSaveSystem } from "@jgengine/core/save/saveDocument";
import { localSaveBackend, type SaveBackend } from "@jgengine/core/save/saveStore";
import { isRecord } from "@jgengine/core/data/untyped";
import { isZone, type Point } from "../world";
import { itemIssues, isItemKind, SET_IDS, type Item } from "./loot";
import { isLittle } from "./littles";
import { UPGRADE_IDS, UPGRADES } from "./burrow";
import { newHome, type Home, type Run } from "./state";

/** One save document per burrow: the persistent burrow, the run in progress and the card's frame. */
export const RECORD_KEY = "crumbrun.burrow.record";
export const RECORD_SLOT = "burrow";
export const RECORD_SLOTS = ["burrow", "burrow-2", "burrow-3"] as const;
export const RECORD_LABEL: Record<string, string> = { burrow: "Burrow I", "burrow-2": "Burrow II", "burrow-3": "Burrow III" };
export function recordEntry(slot: string): string { return `${RECORD_KEY}:${slot}`; }
export const RECORD_ENTRY = recordEntry(RECORD_SLOT);
/** What a record remembers about the screen it left: the save card's captured frame and seconds played. */
export const recordProfile: { thumbnail: string | null; playtime: number } = { thumbnail: null, playtime: 0 };

export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem?(key: string): void }

const UNREADABLE = "The burrow's save is unreadable. It has been kept; restore it before the next run.";
const DAMAGED = "The burrow's save is damaged or from another version. It has been kept.";
const natural = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** A saved instance must satisfy the catalog that rolled it, and its id names the run that found it. */
function validItem(value: unknown, before: number): value is Item {
  if (!isRecord(value) || typeof value["id"] !== "string") return false;
  const item = value as unknown as Item;
  if (itemIssues(item).length > 0 || !isItemKind(item.baseId)) return false;
  const found = /^([1-9]\d*):([a-z-]+)~[a-z0-9-]+$/.exec(item.id), made = /^craft-([1-9]\d*):([a-z-]+)$/.exec(item.id);
  if (found !== null) return found[2] === item.baseId && Number(found[1]) < before;
  if (made !== null) return made[2] === item.baseId;
  return false;
}
export function validHome(value: unknown): value is Home {
  if (!isRecord(value) || value["version"] !== 1) return false;
  const v = value as Record<string, unknown>;
  if (!natural(v["revision"]) || !natural(v["nextRun"]) || (v["nextRun"] as number) < 1 || !natural(v["extractions"]) || !natural(v["caught"]) || !natural(v["caps"])) return false;
  const active = v["activeRun"];
  if (active !== null && (!natural(active) || active !== (v["nextRun"] as number) - 1)) return false;
  if ((v["nextRun"] as number) !== (v["extractions"] as number) + (v["caught"] as number) + 1 + (active === null ? 0 : 1)) return false;
  if (typeof v["caughtPending"] !== "boolean" || !isLittle(v["little"])) return false;
  const before = (active ?? v["nextRun"]) as number;
  for (const key of ["stash", "kidsBox"] as const) {
    const list = v[key];
    if (!Array.isArray(list) || !list.every(item => validItem(item, before + 1))) return false;
  }
  const stash = v["stash"] as Item[];
  if (new Set(stash.map(item => item.id)).size !== stash.length) return false;
  const upgrades = v["upgrades"];
  if (!isRecord(upgrades) || !UPGRADE_IDS.every(id => natural(upgrades[id]) && (upgrades[id] as number) <= UPGRADES[id].levels.length)) return false;
  if (!Array.isArray(v["zones"]) || !v["zones"].every(isZone)) return false;
  if (!Array.isArray(v["sets"]) || !v["sets"].every(id => (SET_IDS as readonly unknown[]).includes(id))) return false;
  if (!Array.isArray(v["bring"]) || !v["bring"].every(id => typeof id === "string" && stash.some(item => item.id === id))) return false;
  const m = v["milestones"];
  if (!isRecord(m) || !["mapRoom", "bulkyBanked", "setsBanked", "deepestExtraction"].every(k => natural(m[k]))) return false;
  if (!isRecord(v["ledger"])) return false;
  const ids = new Set(stash.map(item => item.id));
  if (!Object.entries(v["ledger"]).every(([id, outcome]) => (outcome === "salvaged" || outcome === "sold") && !ids.has(id))) return false;
  const last = v["last"];
  if (last !== null && (!isRecord(last) || (last["kind"] !== "extracted" && last["kind"] !== "lost") || typeof last["reason"] !== "string")) return false;
  return !v["caughtPending"] || (active === null && isRecord(last) && last["kind"] === "lost");
}

/** The live run, as one save section: the run, where the Little stands and what the HUD says. */
export interface RunSnapshot {
  mode: "home" | "run" | "saving" | "caught";
  run: Run | null;
  hint: string;
  pending: { kind: "extracted" | "lost"; reason: string; via: string } | null;
  player: Point | null;
  facing: number;
}
export interface RunHooks { snapshot(): RunSnapshot; restore(next: RunSnapshot | null): void }
export interface RecordSession {
  readonly home: Home;
  readonly restoredRun: RunSnapshot | null;
  load(): Promise<Home>;
  commit(next: Home, run?: RunSnapshot | null): Promise<void>;
  slot(): string;
  peek(slot: string): Promise<GameSaveDocument | null>;
  slots(): Promise<string[]>;
  switchSlot(slot: string): Promise<Home>;
  deleteSlot(slot: string): Promise<boolean>;
  isCurrent(): boolean;
  digest(): string;
}

function readRecord(raw: string): GameSaveDocument {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error(UNREADABLE); }
  if (!isRecord(parsed) || parsed["version"] !== GAME_SAVE_VERSION || !isRecord(parsed["value"])) throw new Error(DAMAGED);
  const document = parsed["value"] as unknown as GameSaveDocument;
  if (!isRecord(document.systems) || !validHome(document.systems["burrow"])) throw new Error(DAMAGED);
  return document;
}

/**
 * One durable record: a shared game-save document whose sections are the burrow, the live run and
 * the card's profile, so a departure or a return lands both in one write before the screen changes.
 */
export function openRecord(storage: StoragePort, run: RunHooks, initialSlot: string = RECORD_SLOT): RecordSession {
  let home = newHome();
  let restored: RunSnapshot | null = null;
  let active = initialSlot;
  let lastRaw: string | null = null;
  let failure: unknown = null;
  let override: RunSnapshot | null | undefined = undefined;

  const burrow: GameSaveSystem<Home> = {
    name: "burrow",
    snapshot: () => home,
    restore: next => { if (validHome(next)) home = next; },
    reset: () => { home = newHome(); },
  };
  const live: GameSaveSystem<RunSnapshot> = {
    name: "run",
    snapshot: () => override !== undefined ? override as RunSnapshot : run.snapshot(),
    restore: next => { restored = next; run.restore(next); },
    reset: () => { restored = null; run.restore(null); },
  };
  const profile: GameSaveSystem<{ thumbnail: string | null; playtime: number }> = {
    name: "profile",
    snapshot: () => ({ thumbnail: recordProfile.thumbnail, playtime: recordProfile.playtime }),
    restore: next => {
      const value = (next ?? {}) as { thumbnail?: unknown; playtime?: unknown };
      recordProfile.thumbnail = typeof value.thumbnail === "string" ? value.thumbnail : null;
      recordProfile.playtime = typeof value.playtime === "number" && Number.isFinite(value.playtime) && value.playtime >= 0 ? value.playtime : 0;
    },
    reset: () => { recordProfile.thumbnail = null; recordProfile.playtime = 0; },
  };
  const save: GameSave = createGameSave({
    backend: backendOver(storage), game: "deepward", key: RECORD_KEY, slot: initialSlot,
    systems: [burrow, live, profile], playtime: () => recordProfile.playtime,
    onError: error => { failure = error; }, devtoolsName: "crumbrun.save",
  });
  async function flush(): Promise<void> {
    failure = null;
    await save.save();
    if (save.status() === "error" || failure !== null) throw failure instanceof Error ? failure : new Error("The burrow could not verify the written record. Reload before continuing.");
    lastRaw = storage.getItem(recordEntry(active));
  }
  const isCurrent = () => storage.getItem(recordEntry(active)) === lastRaw;
  return {
    get home() { return home; },
    get restoredRun() { return restored; },
    async load(): Promise<Home> {
      const stored = storage.getItem(recordEntry(active));
      if (stored !== null) readRecord(stored); // a damaged or future record blocks play instead of silently starting over
      await save.load();
      lastRaw = storage.getItem(recordEntry(active));
      save.touch();
      return home;
    },
    async commit(next: Home, runSection?: RunSnapshot | null): Promise<void> {
      if (!validHome(next)) throw new Error("Invalid burrow save transition");
      if (!isCurrent()) throw new Error("The burrow changed in another window. Reload before continuing.");
      const previous = home;
      home = next; override = runSection;
      try { await flush(); } catch (error) { home = previous; throw error; } finally { override = undefined; }
    },
    slot: () => active,
    peek: slot => save.peek(slot),
    slots: () => save.slots(),
    async switchSlot(slot: string): Promise<Home> {
      if (slot === active) return home;
      const stored = storage.getItem(recordEntry(slot));
      if (stored !== null) readRecord(stored);
      await save.switchSlot(slot, { flush: false });
      active = slot;
      lastRaw = storage.getItem(recordEntry(slot));
      save.touch();
      return home;
    },
    async deleteSlot(slot: string): Promise<boolean> {
      const removed = await save.deleteSlot(slot);
      if (slot === active) lastRaw = null;
      return removed;
    },
    isCurrent,
    digest: () => save.digest(),
  };
}
export function storedBurrow(storage: StoragePort): boolean { return RECORD_SLOTS.some(slot => storage.getItem(recordEntry(slot)) !== null); }
function backendOver(storage: StoragePort): SaveBackend {
  return localSaveBackend({
    getItem: key => storage.getItem(key),
    setItem: (key, value) => { storage.setItem(key, value); },
    removeItem: key => { storage.removeItem?.(key); },
  }, { errorMode: "throw" });
}
