import type { ActionCodes, ActionCodesMap } from "./actionBindings";

/**
 * Player-rebound keys, keyed by action name. Values mirror an `ActionCodes`
 * entry so hold/toggle/repeat semantics survive a rebind — the settings menu
 * only swaps which physical codes drive the action.
 */
export type BindingOverrides = Record<string, ActionCodes>;

export const BINDING_OVERRIDES_STORAGE_PREFIX = "jgengine:keybinds:";

interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function bindingOverridesStorageKey(gameId: string): string {
  return `${BINDING_OVERRIDES_STORAGE_PREFIX}${gameId}`;
}

function defaultStorage(): Pick<WebStorageLike, "getItem" | "setItem" | "removeItem"> | null {
  try {
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
      return (globalThis as { localStorage?: WebStorageLike }).localStorage ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

function isActionCodes(value: unknown): value is ActionCodes {
  if (Array.isArray(value)) return value.every((code) => typeof code === "string");
  if (value === null || typeof value !== "object") return false;
  const modes = value as { hold?: unknown; toggle?: unknown };
  const okList = (list: unknown): boolean =>
    list === undefined || (Array.isArray(list) && list.every((code) => typeof code === "string"));
  return okList(modes.hold) && okList(modes.toggle);
}

export function loadBindingOverrides(
  gameId: string,
  storage: Pick<WebStorageLike, "getItem"> | null | undefined = defaultStorage(),
): BindingOverrides {
  if (storage == null) return {};
  try {
    const raw = storage.getItem(bindingOverridesStorageKey(gameId));
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object") return {};
    const result: BindingOverrides = {};
    for (const [action, codes] of Object.entries(parsed as Record<string, unknown>)) {
      if (isActionCodes(codes)) result[action] = codes;
    }
    return result;
  } catch {
    return {};
  }
}

function persist(
  gameId: string,
  overrides: BindingOverrides,
  storage: Pick<WebStorageLike, "setItem" | "removeItem"> | null | undefined,
): void {
  if (storage == null) return;
  try {
    if (Object.keys(overrides).length === 0) storage.removeItem(bindingOverridesStorageKey(gameId));
    else storage.setItem(bindingOverridesStorageKey(gameId), JSON.stringify(overrides));
  } catch {
    /* ignore quota / private-mode failures */
  }
}

export function saveBindingOverride(
  gameId: string,
  action: string,
  codes: ActionCodes,
  storage: Pick<WebStorageLike, "getItem" | "setItem" | "removeItem"> | null | undefined = defaultStorage(),
): BindingOverrides {
  const overrides = { ...loadBindingOverrides(gameId, storage ?? undefined), [action]: codes };
  persist(gameId, overrides, storage);
  return overrides;
}

export function clearBindingOverride(
  gameId: string,
  action: string,
  storage: Pick<WebStorageLike, "getItem" | "setItem" | "removeItem"> | null | undefined = defaultStorage(),
): BindingOverrides {
  const overrides = { ...loadBindingOverrides(gameId, storage ?? undefined) };
  delete overrides[action];
  persist(gameId, overrides, storage);
  return overrides;
}

export function clearAllBindingOverrides(
  gameId: string,
  storage: Pick<WebStorageLike, "removeItem"> | null | undefined = defaultStorage(),
): void {
  if (storage == null) return;
  try {
    storage.removeItem(bindingOverridesStorageKey(gameId));
  } catch {
    /* ignore */
  }
}

/**
 * Merge player rebinds over a game's authored `input` map. Only actions the
 * game already declares can be overridden; unknown override keys are ignored so
 * a stale localStorage entry can't inject phantom actions.
 */
export function applyBindingOverrides<TAction extends string, TCode extends string>(
  input: ActionCodesMap<TAction, TCode>,
  overrides: BindingOverrides,
): ActionCodesMap<TAction, TCode> {
  if (Object.keys(overrides).length === 0) return input;
  const result = { ...input };
  for (const action of Object.keys(input) as TAction[]) {
    const override = overrides[action];
    if (override !== undefined) result[action] = override as ActionCodes<TCode>;
  }
  return result;
}
