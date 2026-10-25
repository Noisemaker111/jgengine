import { createGameSave, GAME_SAVE_VERSION, type GameSave, type GameSaveDocument, type GameSaveSystem } from "@jgengine/core/game/gameSave";
import { localSaveBackend, type SaveBackend } from "@jgengine/core/game/saveStore";
import type { WeaponSystemState } from "@jgengine/core/combat/weaponSystem";
import { createTransactionLedger, type LedgerState } from "@jgengine/core/economy/transactionLedger";
import type { CareerBankState } from "@jgengine/core/progression/careerBank";
import type { Point } from "../world";
import { openScripBooks } from "./counter";
import { ITEMS, itemIssues, rollItem, type Item, type ItemKind } from "./items";
import { newHome, type Dive, type Home, type Result } from "./state";
import { newDeep, readDeep, type Deep } from "./deep";

/** Where v1-v4 records live. They are read once and rewritten as a record under {@link RECORD_KEY}. */
export const SAVE_KEY = "deepward.marrow.v1";
/** The game-save document: one section for the persistent record, one for the live run. */
export const RECORD_KEY = "deepward.marrow.record";
export const RECORD_SLOT = "marrow";
/** The three records the save-select pane offers: the original slot plus two more. */
export const RECORD_SLOTS = ["marrow", "marrow-2", "marrow-3"] as const;
/** A record's own name, in the game's words rather than a bare slot id. */
export const RECORD_LABEL: Record<string, string> = { marrow: "Record I", "marrow-2": "Record II", "marrow-3": "Record III" };
/** The backend key the save store actually writes (`<key>:<slot>`); the storage event and isCurrent compare it. */
export function recordEntry(slot: string): string {
  return `${RECORD_KEY}:${slot}`;
}
export const RECORD_ENTRY = recordEntry(RECORD_SLOT);
/** What a record remembers about the screen it left: the save card's captured frame and seconds played. */
export const recordProfile: { thumbnail: string | null; playtime: number } = { thumbnail: null, playtime: 0 };

export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

const UNREADABLE = "Marrow's save is unreadable. It has been preserved; restore it before diving.";
const DAMAGED = "Marrow's save is damaged or from another version. It has been preserved.";

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const natural = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const bankAmount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const KINDS: readonly string[] = Object.keys(ITEMS);

/** A stash instance's id names where it came from; the id is the only ownership record there is. */
function validId(item: Item): boolean {
  const purchase = /^purchase-([1-9]\d*):([a-z-]+)$/.exec(item.id);
  if (purchase !== null) return KINDS.includes(purchase[2]!);
  // A worked node's yield also names the node: `7:wire~cold-cable-wire-1`.
  const haul = /^([1-9]\d*):([a-z-]+)(?:~[a-z0-9-]+)?$/.exec(item.id);
  if (haul === null) return false;
  const source = haul[2]!;
  if (source === "fitter") return item.baseId === "service-rifle";
  return source === item.baseId;
}

/** A saved instance must satisfy the same catalog that rolled it, not a hand-copied shape. */
function validItem(value: unknown): value is Item {
  if (!record(value) || typeof value.id !== "string") return false;
  const item = value as unknown as Item;
  if (itemIssues(item).length > 0) return false;
  if (!Number.isInteger(item.level) || item.level < 1 || item.level > 12) return false;
  if (!Array.isArray(item.affixes) || !Array.isArray(item.parts)) return false;
  return validId(item);
}

const purchased = (id: string): boolean => id.startsWith("purchase-");

function validLedger(value: unknown, stash: readonly Item[]): boolean {
  if (!record(value)) return false;
  const ids = new Set(stash.map(item => item.id));
  return Object.entries(value).every(([id, outcome]) => (outcome === "salvaged" || outcome === "sold") && !ids.has(id));
}
function validBank(value: unknown): boolean {
  return record(value) && bankAmount(value.banked) && bankAmount(value.haul) && bankAmount(value.deposited)
    && bankAmount(value.lost) && bankAmount(value.bestHaul) && natural(value.runs);
}
function validStanding(value: unknown): boolean {
  if (!record(value) || !record(value.records)) return false;
  return Object.values(value.records).every(row => record(row) && Object.entries(row).every(([track, score]) => track === "marrow" && typeof score === "number" && Number.isFinite(score)));
}
/** The counter's books must be state the shared ledger can actually restore. */
function validBooks(value: unknown): boolean {
  if (!record(value)) return false;
  return createTransactionLedger().restore(value as unknown as LedgerState);
}

/** The shared fields of every schema version, checked before the version-specific parts. */
function validShared(value: unknown, versions: readonly number[]): value is Record<string, unknown> {
  if (!record(value) || !versions.includes(value.version as number) || !natural(value.revision) || !natural(value.nextDive) || value.nextDive < 1 || !natural(value.life) || value.life < 1 || !natural(value.extractions) || !natural(value.deaths)) return false;
  if (value.life !== value.deaths + 1 || value.nextDive !== value.extractions + value.deaths + 1 + (value.activeDive === null ? 0 : 1)) return false;
  if (value.activeDive !== null && (!natural(value.activeDive) || value.activeDive !== value.nextDive - 1)) return false;
  if (value.last === null) return value.extractions === 0 && value.deaths === 0;
  const last = value.last, version = value.version as number;
  return record(last) && (last.kind === "extracted" || last.kind === "lost") && natural(last.dive) && last.dive > 0 && last.dive < (value.activeDive ?? value.nextDive) && (natural(last.count) || (version >= 2 && last.kind === "lost" && last.count === null)) && typeof last.reason === "string"
    && (last.scrip === undefined || bankAmount(last.scrip));
}
/** A haul id names the dive it came from, so an item can never appear before the Life that found it. */
function ownedBefore(ids: readonly string[], dive: number): boolean {
  return ids.every(id => purchased(id) || Number(id.split(":")[0]) < dive);
}
function currentStash(value: Record<string, unknown>): value is Record<string, unknown> & { stash: Item[] } {
  const stash = value.stash;
  if (!Array.isArray(stash) || !stash.every(validItem) || new Set(stash.map(i => i.id)).size !== stash.length) return false;
  if (!ownedBefore(stash.map(i => i.id), (value.activeDive ?? value.nextDive) as number)) return false;
  if (value.last === null && !stash.every(i => purchased(i.id))) return false;
  return true;
}
export function validHome(value: unknown): value is Home {
  return validHomeShape(value);
}
function validHomeShape(value: unknown): value is Home {
  if (!validShared(value, [5]) || value.version !== 5) return false;
  if (!currentStash(value)) return false;
  if (!Array.isArray(value.refits)) return false;
  if (!value.refits.every(id => id === "tank" || id === "reserve") || new Set(value.refits).size !== value.refits.length) return false;
  if (typeof value.reprintPending !== "boolean") return false;
  if (!validBank(value.bank) || !validStanding(value.standing)) return false;
  if (!validLedger(value.ledger, value.stash)) return false;
  if (!validBooks(value.books)) return false;
  return !value.reprintPending || (value.activeDive === null && record(value.last) && value.last.kind === "lost");
}

interface LegacyItem { uid: string; kind: ItemKind; level: number }
/** v1-v3 stored an item as kind + level only; migrating rolls the instance the catalog would have. */
function legacyItem(value: unknown): value is LegacyItem {
  return record(value) && typeof value.uid === "string" && typeof value.kind === "string" && KINDS.includes(value.kind) && value.level === 1;
}
/** Read legacy bytes without writing; the first record write migrates them atomically. */
function readHome(value: unknown): Home | null {
  if (validHomeShape(value)) return value;
  if (validShared(value, [4])) {
    // v4 is this shape without the counter's books: open them at the balance it banked.
    const { books: _books, ...rest } = value as Record<string, unknown>;
    const upgraded = { ...rest, version: 5, books: openScripBooks((value.bank as CareerBankState).banked) };
    return validHomeShape(upgraded) ? upgraded : null;
  }
  if (!validShared(value, [1, 2, 3])) return null;
  const stash = value.stash;
  if (!Array.isArray(stash) || !stash.every(legacyItem)) return null;
  if (!ownedBefore(stash.map(i => i.uid), (value.activeDive ?? value.nextDive) as number)) return null;
  if (value.last === null && !stash.every(i => purchased(i.uid))) return null;
  return migrate(value, value.version as number, stash);
}
function migrate(value: Record<string, unknown>, version: number, stash: readonly LegacyItem[]): Home {
  const blank = newHome();
  const refitted = {
    ...value,
    refits: version === 1 ? [] : value.refits,
    reprintPending: version === 1 ? record(value.last) && value.last.kind === "lost" && value.activeDive === null : value.reprintPending,
  };
  const items = stash.map(entry => rollItem(entry.kind, 1, `deepward:legacy:${entry.uid}`, entry.uid));
  return { ...(refitted as unknown as Home), version: 5, bank: blank.bank, standing: blank.standing, ledger: {}, books: blank.books, stash: items };
}

/** The live run, as one save section: what the HUD shows and where the diver stands. */
export interface RunSnapshot {
  mode: "home" | "dive" | "saving" | "reprinting";
  dive: Dive | null;
  rifleUid: string | null;
  hint: string;
  pending: { kind: Result["kind"]; reason: string } | null;
  player: Point | null;
  /** The held weapon's shared runtime state, so a reload mid-dive keeps its magazine and cadence. */
  weapon: WeaponSystemState | null;
  hand: string | null;
}

/** What save.ts needs from the running game to snapshot and restore the live run. */
export interface RunHooks {
  snapshot(): RunSnapshot;
  restore(next: RunSnapshot | null): void;
  /** The descent section: body, gear, scans, charted strata and Marrow's base world. */
  deep?: { snapshot(): Deep; restore(next: Deep): void };
}

export interface RecordSession {
  readonly home: Home;
  /** The run section the last load applied, or null for a record with no run. */
  readonly restoredRun: RunSnapshot | null;
  load(): Promise<Home>;
  /**
   * Commit a settled record. `run` writes a run section other than the live view, so a departure or
   * a return lands both sections in one document before the screen changes.
   */
  commit(next: Home, run?: RunSnapshot | null): Promise<void>;
  /** The record this session currently reads and writes. */
  slot(): string;
  /** Read another record's document without applying it - the save-select pane's data source. */
  peek(slot: string): Promise<GameSaveDocument | null>;
  /** Records already written on this profile. */
  slots(): Promise<string[]>;
  /** Open another record (an empty slot resets both sections to a fresh Marrow). */
  switchSlot(slot: string): Promise<Home>;
  /** Delete a record's document; deleting the open record leaves a fresh one live. */
  deleteSlot(slot: string): Promise<boolean>;
  isCurrent(): boolean;
  digest(): string;
}

function decodeLegacy(raw: string): Home {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error(UNREADABLE); }
  const home = readHome(parsed);
  if (home === null) throw new Error(DAMAGED);
  return home;
}

/** A stored record's section, checked against the same catalog as the live game. */
function readRecord(raw: string): GameSaveDocument {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error(UNREADABLE); }
  if (!record(parsed) || typeof parsed.version !== "number" || !record(parsed.value)) throw new Error(DAMAGED);
  if (parsed.version !== GAME_SAVE_VERSION) throw new Error(DAMAGED);
  const document = parsed.value as unknown as GameSaveDocument;
  if (!record(document.systems)) throw new Error(DAMAGED);
  if (!validHome(document.systems.marrow)) throw new Error(DAMAGED);
  return document;
}

/**
 * One durable record: a shared game-save document whose sections are the persistent Marrow record
 * and the live run, so mounted systems snapshot themselves instead of a hand-written shape. The
 * v1-v4 bytes at {@link SAVE_KEY} are read once and rewritten as a record; the old bytes stay put.
 */
export function openRecord(storage: StoragePort, run: RunHooks, initialSlot: string = RECORD_SLOT): RecordSession {
  let home = newHome();
  let restored: RunSnapshot | null = null;
  let active = initialSlot;
  let lastRaw: string | null = null;
  let legacyRaw: string | null = null;
  let failure: unknown = null;
  /** Set for the duration of one commit so the document carries a run other than the live view. */
  let override: RunSnapshot | null | undefined = undefined;

  const marrow: GameSaveSystem<Home> = {
    name: "marrow",
    snapshot: () => home,
    restore: next => { const loaded = readHome(next); if (loaded !== null) home = loaded; },
    reset: () => { home = newHome(); },
  };
  const live: GameSaveSystem<RunSnapshot> = {
    name: "run",
    snapshot: () => override !== undefined ? override as RunSnapshot : run.snapshot(),
    restore: next => { restored = next; run.restore(next); },
    reset: () => { restored = null; run.restore(null); },
  };
  /** The card's captured frame and the record's played seconds, written with the same document. */
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
  /** Deepward below receiving, as its own section: a record from before the strata loads untouched. */
  const deep: GameSaveSystem<Deep> = {
    name: "deep",
    snapshot: () => run.deep?.snapshot() ?? newDeep(),
    restore: next => { run.deep?.restore(readDeep(next)); },
    reset: () => { run.deep?.restore(newDeep()); },
  };
  const save: GameSave = createGameSave({
    backend: backendOver(storage),
    game: "deepward",
    key: RECORD_KEY,
    slot: initialSlot,
    systems: [marrow, live, profile, deep],
    playtime: () => recordProfile.playtime,
    onError: error => { failure = error; },
    devtoolsName: "deepward.save",
  });

  async function flush(): Promise<void> {
    failure = null;
    await save.save();
    if (save.status() === "error" || failure !== null) throw failure instanceof Error ? failure : new Error("Marrow could not verify the written record. Reload before continuing.");
    lastRaw = storage.getItem(recordEntry(active));
  }

  function isCurrent(): boolean {
    const stored = storage.getItem(recordEntry(active));
    if (stored !== null) return stored === lastRaw;
    return storage.getItem(SAVE_KEY) === legacyRaw;
  }

  return {
    get home() { return home; },
    get restoredRun() { return restored; },
    async load(): Promise<Home> {
      const stored = storage.getItem(recordEntry(active));
      legacyRaw = active === RECORD_SLOT ? storage.getItem(SAVE_KEY) : null;
      if (stored !== null) {
        readRecord(stored); // a damaged or future record blocks play instead of silently starting over
        await save.load();
      } else if (legacyRaw !== null) {
        home = decodeLegacy(legacyRaw);
        await flush(); // the migration is the first record write
      } else {
        await save.load(); // no bytes: both systems reset to a fresh Marrow
      }
      lastRaw = storage.getItem(recordEntry(active));
      save.touch();
      return home;
    },
    async commit(next: Home, runSection?: RunSnapshot | null): Promise<void> {
      if (!validHome(next)) throw new Error("Invalid Marrow save transition");
      if (!isCurrent()) throw new Error("Marrow changed in another window. Reload before continuing.");
      const previous = home;
      home = next;
      override = runSection;
      try { await flush(); }
      catch (error) { home = previous; throw error; }
      finally { override = undefined; }
    },
    slot: () => active,
    peek: slot => save.peek(slot),
    slots: () => save.slots(),
    async switchSlot(slot: string): Promise<Home> {
      if (slot === active) return home;
      const stored = storage.getItem(recordEntry(slot));
      if (stored !== null) readRecord(stored); // the same damaged-record gate the first load gets
      await save.switchSlot(slot, { flush: false });
      active = slot;
      lastRaw = storage.getItem(recordEntry(slot));
      save.touch();
      return home;
    },
    async deleteSlot(slot: string): Promise<boolean> {
      const removed = await save.deleteSlot(slot);
      // Deleting the open record resets both sections to a fresh Marrow, so the cursor moves with it.
      if (slot === active) lastRaw = null;
      return removed;
    },
    isCurrent,
    digest: () => save.digest(),
  };
}

/** Whether any Marrow record is on disk - the title's Continue gate, not a remembered flag. */
export function storedMarrow(storage: StoragePort): boolean {
  return RECORD_SLOTS.some(slot => storage.getItem(recordEntry(slot)) !== null) || storage.getItem(SAVE_KEY) !== null;
}

function backendOver(storage: StoragePort): SaveBackend {
  return localSaveBackend({
    getItem: key => storage.getItem(key),
    setItem: (key, value) => { storage.setItem(key, value); },
    removeItem: key => { storage.removeItem?.(key); },
  }, { errorMode: "throw" });
}
