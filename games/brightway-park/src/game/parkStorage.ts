import { defaultKeyValueStorage, type KeyValueStorage } from "@jgengine/core/game/keyValueStore";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

/**
 * Where the haunt's save document is written: the browser's storage, or, where there is none (a
 * headless run, a suite proof), one in-memory store per host save backend (`ctx.game.save.backend`),
 * so a restarted session on the same host finds the haunt it left and a new host starts empty.
 * `bindParkStorage` points it at the live context's host.
 */
const memoryStores = new WeakMap<object, Map<string, string>>();
const loose = new Map<string, string>();
let bound: KeyValueStorage | null = null;

function memoryStorage(map: Map<string, string>): KeyValueStorage {
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value); }, removeItem: (key) => { map.delete(key); } };
}

export function bindParkStorage(ctx: GameContext): void {
  const browser = defaultKeyValueStorage();
  if (browser !== null) { bound = browser; return; }
  const host = ctx.game.save?.backend;
  let store = host === undefined ? loose : memoryStores.get(host);
  if (store === undefined && host !== undefined) { store = new Map(); memoryStores.set(host, store); }
  bound = memoryStorage(store ?? loose);
}

/** The storage the save is written to now (the browser's when there is one). */
export function parkStorage(): KeyValueStorage | null {
  return defaultKeyValueStorage() ?? bound;
}
