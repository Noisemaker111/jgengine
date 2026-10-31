import { createKeyValueStore, type KeyValueStorage } from "@jgengine/core/game/keyValueStore";

/** Where this device keeps its per-world camera look and open-menu state. The world save itself is on Convex. */
export const LOCAL_GAME_STATE_KEY = "llmville:local-game-state";

/** Key prefix of the per-key layout this state used before it moved into one document. */
export const LEGACY_LOCAL_KEY_PREFIX = "ai-game:";

const LEGACY_CAMERA_LOOK = /^ai-game:camera-look:(.+):slot-(\d+)$/;
const LEGACY_UI_SESSION = /^ai-game:game-ui-session:(.+)$/;

export interface CameraLook {
  yaw: number;
  pitch: number;
}

interface WorldLocalState {
  cameraLook: Record<string, CameraLook>;
  menu?: unknown;
}

export interface LocalGameStateDocument {
  version: 1;
  worlds: Record<string, WorldLocalState>;
}

/** Lists keys so the legacy layout can be found once; the browser's `localStorage` satisfies it. */
export interface StorageKeyList {
  readonly length: number;
  key(index: number): string | null;
}

export interface LocalGameState {
  readCameraLook(slot: number, gameId: string): CameraLook | null;
  writeCameraLook(slot: number, gameId: string, look: CameraLook): void;
  /** The stored menu state for a world, unparsed: the tablet owns its shape. */
  readMenu(gameId: string): unknown;
  writeMenu(gameId: string, menu: unknown): void;
  snapshot(): LocalGameStateDocument;
  restore(document: LocalGameStateDocument): void;
  reset(): void;
}

const EMPTY_DOCUMENT: LocalGameStateDocument = { version: 1, worlds: {} };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseCameraLook(value: unknown): CameraLook | null {
  if (typeof value !== "object" || value === null || !("yaw" in value) || !("pitch" in value)) return null;
  if (!isFiniteNumber(value.yaw) || !isFiniteNumber(value.pitch)) return null;
  return { yaw: value.yaw, pitch: value.pitch };
}

function parseDocument(raw: string): LocalGameStateDocument {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || !("version" in parsed) || parsed.version !== 1) return EMPTY_DOCUMENT;
  if (!("worlds" in parsed) || typeof parsed.worlds !== "object" || parsed.worlds === null) return EMPTY_DOCUMENT;
  const worlds: Record<string, WorldLocalState> = {};
  for (const [gameId, world] of Object.entries(parsed.worlds)) {
    if (typeof world !== "object" || world === null) continue;
    const cameraLook: Record<string, CameraLook> = {};
    if ("cameraLook" in world && typeof world.cameraLook === "object" && world.cameraLook !== null) {
      for (const [slot, look] of Object.entries(world.cameraLook)) {
        const parsedLook = parseCameraLook(look);
        if (parsedLook !== null) cameraLook[slot] = parsedLook;
      }
    }
    worlds[gameId] = "menu" in world ? { cameraLook, menu: world.menu } : { cameraLook };
  }
  return { version: 1, worlds };
}

function parseJson(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Reads the old per-key layout (`ai-game:camera-look:<game>:slot-<n>`, `ai-game:game-ui-session:<game>`)
 * into one document and lists every `ai-game:` key to remove, including the account keys nothing reads.
 */
export function readLegacyLocalGameState(
  storage: KeyValueStorage,
  keys: StorageKeyList,
): { document: LocalGameStateDocument; legacyKeys: string[] } {
  const legacyKeys: string[] = [];
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys.key(index);
    if (key !== null && key.startsWith(LEGACY_LOCAL_KEY_PREFIX)) legacyKeys.push(key);
  }
  const worlds: Record<string, WorldLocalState> = {};
  const world = (gameId: string): WorldLocalState => {
    const existing = worlds[gameId];
    if (existing !== undefined) return existing;
    const created: WorldLocalState = { cameraLook: {} };
    worlds[gameId] = created;
    return created;
  };
  for (const key of legacyKeys) {
    const look = LEGACY_CAMERA_LOOK.exec(key);
    if (look !== null && look[1] !== undefined && look[2] !== undefined) {
      const parsed = parseCameraLook(parseJson(storage.getItem(key)));
      if (parsed !== null) world(look[1]).cameraLook[look[2]] = parsed;
      continue;
    }
    const session = LEGACY_UI_SESSION.exec(key);
    if (session !== null && session[1] !== undefined) {
      const parsed = parseJson(storage.getItem(key));
      if (typeof parsed === "object" && parsed !== null && "version" in parsed && parsed.version === 1 && "menu" in parsed) {
        world(session[1]).menu = parsed.menu;
      }
    }
  }
  return { document: { version: 1, worlds }, legacyKeys };
}

/**
 * This device's per-world camera look and menu state, as one document in an engine key-value
 * store on the injected storage. Passing `keys` moves the legacy per-key layout in once.
 */
export function createLocalGameState(storage: KeyValueStorage | null, keys?: StorageKeyList): LocalGameState {
  const store = createKeyValueStore<LocalGameStateDocument>({
    key: LOCAL_GAME_STATE_KEY,
    initial: EMPTY_DOCUMENT,
    storage,
    deserialize: parseDocument,
  });

  if (storage !== null && keys !== undefined) {
    try {
      const legacy = readLegacyLocalGameState(storage, keys);
      if (legacy.legacyKeys.length > 0) {
        if (storage.getItem(LOCAL_GAME_STATE_KEY) === null) store.set(legacy.document);
        for (const key of legacy.legacyKeys) storage.removeItem(key);
      }
    } catch {
      // Storage refused the scan; the old keys stay and the move retries next boot.
    }
  }

  const updateWorld = (gameId: string, mutate: (world: WorldLocalState) => WorldLocalState): void => {
    store.update((document) => ({
      version: 1,
      worlds: { ...document.worlds, [gameId]: mutate(document.worlds[gameId] ?? { cameraLook: {} }) },
    }));
  };

  return {
    readCameraLook: (slot, gameId) => store.get().worlds[gameId]?.cameraLook[String(slot)] ?? null,
    writeCameraLook(slot, gameId, look) {
      const safe = { yaw: isFiniteNumber(look.yaw) ? look.yaw : 0, pitch: isFiniteNumber(look.pitch) ? look.pitch : 0 };
      updateWorld(gameId, (world) => ({ ...world, cameraLook: { ...world.cameraLook, [String(slot)]: safe } }));
    },
    readMenu: (gameId) => store.get().worlds[gameId]?.menu,
    writeMenu(gameId, menu) {
      updateWorld(gameId, (world) => ({ ...world, menu }));
    },
    snapshot: () => store.get(),
    restore: (document) => store.set(document),
    reset: () => store.clear(),
  };
}

let shared: LocalGameState | null = null;

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The browser-wired instance the game uses. */
export function localGameState(): LocalGameState {
  if (shared === null) {
    const storage = browserStorage();
    shared = createLocalGameState(storage, storage ?? undefined);
  }
  return shared;
}

/** Forgets every world's local camera and menu state (a new or deleted world). */
export function clearAllLocalGamePersistence(): void {
  localGameState().reset();
}
