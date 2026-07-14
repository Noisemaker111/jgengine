import type { StoreHandle } from "@jgengine/core/store/defineStore";
import type { KeyedStoreHandle } from "@jgengine/core/store/defineKeyedStore";
import { useGameStore } from "./hooks";

/**
 * Subscribe a component to a typed store slot defined with `defineStore`. Returns the current value
 * (or the definition's initial before any write), re-rendering only when the slot changes — the
 * cast-free, boilerplate-free replacement for a hand-written `useGameStore((ctx) => ctx.game.store.get(KEY) as T)`.
 *
 * Pass a `selector` to read a derived slice with its own equality, so a HUD that watches one field
 * doesn't re-render on every unrelated store write.
 */
export function useStore<T>(handle: StoreHandle<T>): T;
export function useStore<T, S>(
  handle: StoreHandle<T>,
  selector: (value: T) => S,
  isEqual?: (previous: S, next: S) => boolean,
): S;
export function useStore<T, S>(
  handle: StoreHandle<T>,
  selector?: (value: T) => S,
  isEqual: (previous: S, next: S) => boolean = Object.is,
): T | S {
  const select = selector;
  return useGameStore(
    (ctx) => (select === undefined ? handle.read(ctx) : select(handle.read(ctx))),
    select === undefined ? Object.is : (isEqual as (previous: T | S, next: T | S) => boolean),
  );
}

/**
 * Subscribe a component to one owner's slot of a typed keyed-family store defined with
 * `defineKeyedStore`. Returns the current value for `id` (or the definition's initial before any
 * write for that id), re-rendering only when that owner's slot changes — the cast-free,
 * boilerplate-free replacement for a hand-written
 * `useGameStore((ctx) => ctx.game.store.get(`prefix:${id}`) as T)`.
 *
 * Pass a `selector` to read a derived slice with its own equality, so a HUD that watches one field
 * of one owner's state doesn't re-render on every unrelated store write.
 */
export function useKeyedStore<T>(handle: KeyedStoreHandle<T>, id: string): T;
export function useKeyedStore<T, S>(
  handle: KeyedStoreHandle<T>,
  id: string,
  selector: (value: T) => S,
  isEqual?: (previous: S, next: S) => boolean,
): S;
export function useKeyedStore<T, S>(
  handle: KeyedStoreHandle<T>,
  id: string,
  selector?: (value: T) => S,
  isEqual: (previous: S, next: S) => boolean = Object.is,
): T | S {
  const select = selector;
  return useGameStore(
    (ctx) => (select === undefined ? handle.read(ctx, id) : select(handle.read(ctx, id))),
    select === undefined ? Object.is : (isEqual as (previous: T | S, next: T | S) => boolean),
  );
}
