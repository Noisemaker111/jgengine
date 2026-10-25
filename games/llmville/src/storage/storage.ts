import { TABLET_APPS, TABLET_STORE_TABS, type PersistedGameMenuState, type TabletAppId, type TabletStoreTabId } from "@/tablet/tablet";

export const GAME_STORAGE_KEYS = {
  activeSaveSlot: "ai-game:active-save-slot",
  lastActiveGameId: "ai-game:last-active-game-id",
  avatarId: "ai-game:avatar-id",
  playerName: "ai-game:player-name",
  playerId: "ai-game:player-id",
  cameraLook: "ai-game:camera-look",
  gameUiSession: "ai-game:game-ui-session",
} as const;

const LEGACY_LOCAL_GAME_DATA_KEY = "ai-game:local-game-data";

const SAVE_SPLOT_COUNT = 3;

interface CameraLookSnapshot {
  yaw: number;
  pitch: number;
}

interface StoredGameUiSession {
  version: 1;
  menu: PersistedGameMenuState;
}

function slotStorageKey(baseKey: string, slot: number): string {
  return `${baseKey}:slot-${slot}`;
}

function gameScopedSlotStorageKey(baseKey: string, gameId: string, slot: number): string {
  return `${baseKey}:${gameId}:slot-${slot}`;
}

function collectGameScopedSlotKeys(baseKey: string, slot: number): string[] {
  const prefix = `${baseKey}:`;
  const suffix = `:slot-${slot}`;
  const keysToRemove: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key !== null && key.startsWith(prefix) && key.endsWith(suffix)) {
      keysToRemove.push(key);
    }
  }
  return keysToRemove;
}

function gameUiSessionStorageKey(gameId: string): string {
  return `${GAME_STORAGE_KEYS.gameUiSession}:${gameId}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isTabletAppId(value: unknown): value is TabletAppId {
  return typeof value === "string" && TABLET_APPS.some((app) => app.id === value);
}

function normalizeLegacyStoreTabId(value: unknown): TabletStoreTabId | null {
  if (value === "decorations" || value === "furniture") return "decor";
  return isTabletStoreTabId(value) ? value : null;
}

function isTabletStoreTabId(value: unknown): value is TabletStoreTabId {
  return typeof value === "string" && TABLET_STORE_TABS.some((tabId) => tabId === value);
}

function parsePersistedGameMenuState(value: unknown): PersistedGameMenuState | null {
  if (typeof value !== "object" || value === null || !("type" in value) || typeof value.type !== "string") {
    return null;
  }

  if (value.type === "closed" || value.type === "tablet-home") {
    return { type: value.type };
  }

  if (value.type === "tablet-app") {
    if (!("appId" in value) || typeof value.appId !== "string") return null;
    if (value.appId === "bills" || value.appId === "finance") return { type: "tablet-home" };
    const rawAppId = value.appId;
    if (!isTabletAppId(rawAppId)) return null;
    if (!("storeTab" in value)) return null;
    const storeTab = normalizeLegacyStoreTabId(value.storeTab);
    if (storeTab === null) return null;
    return { type: "tablet-app", appId: rawAppId, storeTab };
  }

  return null;
}

export function clearLastActiveGameId(): void {
  window.localStorage.removeItem(GAME_STORAGE_KEYS.lastActiveGameId);
}

export function clearActiveSaveSlot(): void {
  window.localStorage.removeItem(GAME_STORAGE_KEYS.activeSaveSlot);
}

function clearLegacyLocalGameDataForSlot(slot: number): void {
  for (const key of collectGameScopedSlotKeys(LEGACY_LOCAL_GAME_DATA_KEY, slot)) {
    window.localStorage.removeItem(key);
  }

  window.localStorage.removeItem(slotStorageKey(LEGACY_LOCAL_GAME_DATA_KEY, slot));
  if (slot === 0) {
    window.localStorage.removeItem(LEGACY_LOCAL_GAME_DATA_KEY);
  }
}

export function readCameraLookForSlot(slot: number, gameId: string): CameraLookSnapshot | null {
  const raw = window.localStorage.getItem(gameScopedSlotStorageKey(GAME_STORAGE_KEYS.cameraLook, gameId, slot));
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    if (!("yaw" in parsed) || !("pitch" in parsed)) return null;

    if (!isFiniteNumber(parsed.yaw) || !isFiniteNumber(parsed.pitch)) return null;
    return { yaw: parsed.yaw, pitch: parsed.pitch };
  } catch {
    return null;
  }
}

export function writeCameraLookForSlot(slot: number, gameId: string, look: CameraLookSnapshot): void {
  const safeYaw = isFiniteNumber(look.yaw) ? look.yaw : 0;
  const safePitch = isFiniteNumber(look.pitch) ? look.pitch : 0;
  window.localStorage.setItem(gameScopedSlotStorageKey(GAME_STORAGE_KEYS.cameraLook, gameId, slot), JSON.stringify({ yaw: safeYaw, pitch: safePitch }));
}

export function clearCameraLookForSlot(slot: number, gameId?: string): void {
  if (gameId !== undefined) {
    window.localStorage.removeItem(gameScopedSlotStorageKey(GAME_STORAGE_KEYS.cameraLook, gameId, slot));
    return;
  }

  for (const key of collectGameScopedSlotKeys(GAME_STORAGE_KEYS.cameraLook, slot)) {
    window.localStorage.removeItem(key);
  }

  // One-way cleanup for the old slot-only camera key layout.
  window.localStorage.removeItem(slotStorageKey(GAME_STORAGE_KEYS.cameraLook, slot));
}

export function readGameUiSession(gameId: string): PersistedGameMenuState {
  const raw = window.localStorage.getItem(gameUiSessionStorageKey(gameId));
  if (raw === null) return { type: "closed" };

  try {
    const parsed: unknown = JSON.parse(raw);
    // UI session state is low-value: unsupported snapshots reset closed instead of migrating.
    if (typeof parsed !== "object" || parsed === null || !("version" in parsed) || parsed.version !== 1 || !("menu" in parsed)) {
      return { type: "closed" };
    }

    const menu = parsePersistedGameMenuState(parsed.menu);
    return menu ?? { type: "closed" };
  } catch {
    return { type: "closed" };
  }
}

export function writeGameUiSession(gameId: string, menu: PersistedGameMenuState): void {
  const snapshot: StoredGameUiSession = { version: 1, menu };
  window.localStorage.setItem(gameUiSessionStorageKey(gameId), JSON.stringify(snapshot));
}

export function clearAllLocalGamePersistence(): void {
  for (let slot = 0; slot < SAVE_SPLOT_COUNT; slot += 1) {
    clearLegacyLocalGameDataForSlot(slot);
    clearCameraLookForSlot(slot);
  }
  clearActiveSaveSlot();
  clearLastActiveGameId();
  window.localStorage.removeItem(GAME_STORAGE_KEYS.avatarId);
  window.localStorage.removeItem(GAME_STORAGE_KEYS.playerId);
  window.localStorage.removeItem(GAME_STORAGE_KEYS.playerName);

  const gameUiSessionPrefix = `${GAME_STORAGE_KEYS.gameUiSession}:`;
  const keysToRemove: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key !== null && key.startsWith(gameUiSessionPrefix)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    window.localStorage.removeItem(key);
  }
}
