import { defaultKeyValueStorage } from "@jgengine/core/game/keyValueStore";
import type { SessionLoopState } from "@jgengine/core/run/sessionLoop";
import { perContext } from "@jgengine/core/runtime/perContext";
import { createGameSave, type GameSaveSystem } from "@jgengine/core/save/saveDocument";
import { localSaveBackend, memorySaveBackend, type SaveBackend } from "@jgengine/core/save/saveStore";

import { CAREER_KEY, newCareer, readCareer, type CareerSave } from "./career";
import { GHOST_KEY, readGhosts, type SavedGhost } from "./run/ghost";
import { PROGRESS_KEY, readParkedRun, type ParkedRun } from "./run/progress";
import { EMPTY_RECORDS, RECORDS_KEY, readRecords, type RunRecords } from "./run/records";
import { readRunState, RUN_STATE_KEY } from "./run/shiftState";

/** The yard's save document namespace. The corridor is one ladder, so the yard keeps one slot. */
export const FOUNDRY_SAVE_KEY = "drift-foundry.yard";
export const FOUNDRY_SLOT = "yard";
export const FOUNDRY_ENTRY = `${FOUNDRY_SAVE_KEY}:${FOUNDRY_SLOT}`;
export const PIT_FRAME_KEY = "drift-foundry.pit-frame.v1";

export interface PitFrame {
  thumbnail: string | null;
  savedAt: number;
}

const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

export function readPitFrame(value: unknown): PitFrame {
  if (value === null || typeof value !== "object") return { thumbnail: null, savedAt: 0 };
  const raw = value as Partial<Record<keyof PitFrame, unknown>>;
  return {
    thumbnail: typeof raw.thumbnail === "string" && raw.thumbnail.length > 0 && raw.thumbnail.length <= 256 * 1024 ? raw.thumbnail : null,
    savedAt: nonnegative(raw.savedAt) ? raw.savedAt : 0,
  };
}

/**
 * Everything the yard keeps between visits, one section each in the yard's save document: the run
 * records, the run loop's history, the career, each event's ghost, the parked buggy and the pit's
 * card frame. Each section keeps the shape an older build wrote at its own key, so those bytes lift
 * into the document as-is.
 */
export interface FoundryProfile {
  records: RunRecords;
  run: SessionLoopState | null;
  career: CareerSave;
  ghosts: Record<string, SavedGhost>;
  parked: ParkedRun | null;
  pitFrame: PitFrame;
}

export function newFoundryProfile(): FoundryProfile {
  return { records: { ...EMPTY_RECORDS }, run: null, career: newCareer(), ghosts: {}, parked: null, pitFrame: { thumbnail: null, savedAt: 0 } };
}

const READERS: { readonly [K in keyof FoundryProfile]: (value: unknown) => FoundryProfile[K] } = {
  records: readRecords,
  run: readRunState,
  career: readCareer,
  ghosts: readGhosts,
  parked: readParkedRun,
  pitFrame: readPitFrame,
};

/** The key each section was kept under before the yard had one document. */
const LEGACY_KEYS: { readonly [K in keyof FoundryProfile]: string } = {
  records: RECORDS_KEY,
  run: RUN_STATE_KEY,
  career: CAREER_KEY,
  ghosts: GHOST_KEY,
  parked: PROGRESS_KEY,
  pitFrame: PIT_FRAME_KEY,
};

const SECTIONS = Object.keys(READERS) as (keyof FoundryProfile)[];

export function readFoundryProfile(sections: Readonly<Record<string, unknown>>): FoundryProfile {
  const profile = newFoundryProfile();
  for (const name of SECTIONS) {
    if (Object.hasOwn(sections, name)) assign(profile, name, READERS[name](sections[name]));
  }
  return profile;
}

function assign<K extends keyof FoundryProfile>(profile: FoundryProfile, name: K, value: FoundryProfile[K]): void {
  profile[name] = value;
}

/** The old per-key bytes become sections; a key that is not JSON is left out, so its section starts fresh. */
function liftKeys(stored: Readonly<Record<string, string>>): Record<string, unknown> {
  const sections: Record<string, unknown> = {};
  for (const name of SECTIONS) {
    const raw = stored[LEGACY_KEYS[name]];
    if (raw === undefined) continue;
    try { sections[name] = JSON.parse(raw); } catch { /* an unreadable old key starts its section fresh */ }
  }
  return sections;
}

export interface FoundrySave {
  readonly profile: FoundryProfile;
  readonly persistent: boolean;
  write(): Promise<boolean>;
  load(): Promise<FoundryProfile>;
  peek(): Promise<FoundryProfile | null>;
  digest(): string;
}

export function browserFoundrySave(): FoundrySave {
  return createFoundrySave(defaultKeyValueStorage() === null ? null : localSaveBackend());
}

export const foundrySaveOf = perContext((): FoundrySave => browserFoundrySave());

export function createFoundrySave(backend: SaveBackend | null, initial: Partial<FoundryProfile> = {}): FoundrySave {
  const profile: FoundryProfile = { ...newFoundryProfile(), ...initial };
  const fresh = newFoundryProfile();
  const systems: GameSaveSystem[] = SECTIONS.map((name) => ({
    name,
    snapshot: () => profile[name],
    restore: (value: unknown) => assign(profile, name, READERS[name](value)),
    reset: () => assign(profile, name, structuredClone(fresh[name])),
  }));
  const save = createGameSave({
    backend: backend ?? memorySaveBackend(),
    game: "drift-foundry",
    key: FOUNDRY_SAVE_KEY,
    slot: FOUNDRY_SLOT,
    systems,
    legacy: { keys: () => SECTIONS.map((name) => LEGACY_KEYS[name]), lift: liftKeys },
  });
  /** A write waits for the boot read, so it never replaces a stored yard with the fresh one. */
  let loading: Promise<unknown> = Promise.resolve();
  return {
    profile,
    persistent: backend !== null,
    async write() {
      if (backend === null) return false;
      await loading;
      try { await save.save(); } catch { return false; }
      return save.status() === "saved";
    },
    async load() {
      if (backend === null) return profile;
      loading = save.load().catch(() => undefined);
      await loading;
      return profile;
    },
    async peek() {
      if (backend === null) return null;
      const read = await save.peek(FOUNDRY_SLOT);
      return read.kind === "loaded" ? readFoundryProfile(read.value.systems) : null;
    },
    digest: () => save.digest(),
  };
}
