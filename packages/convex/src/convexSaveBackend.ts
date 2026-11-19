import type { ConvexReactClient } from "convex/react";
import type { FunctionReference } from "convex/server";
import { anyApi } from "convex/server";

import { remoteSaveBackend, type SaveBackend } from "@jgengine/core/save/saveStore";

/** The four Convex functions a save backend calls — a `query` that returns the stored string (or `null`), a `query` listing the keys under a prefix, and two `mutation`s. Point them at your app's own module, or lean on the default `saves.*` convention. */
export interface ConvexSaveFunctions {
  read: FunctionReference<"query", "public", { key: string }, string | null>;
  keys: FunctionReference<"query", "public", { prefix: string }, string[]>;
  write: FunctionReference<"mutation", "public", { key: string; value: string }, unknown>;
  remove: FunctionReference<"mutation", "public", { key: string }, unknown>;
}

/** Default `saves.read` / `saves.keys` / `saves.write` / `saves.remove` refs for apps that follow the convention — pass your own `functions` to override. */
export function defaultConvexSaveFunctions(): ConvexSaveFunctions {
  return (anyApi as unknown as { saves: ConvexSaveFunctions }).saves;
}

/** Config for {@link createConvexSaveBackend} — the Convex client, optional function refs (defaults to the `saves.*` convention), and an optional key `namespace`. */
export interface ConvexSaveBackendOptions {
  client: ConvexReactClient;
  /** The read/keys/write/remove function refs; defaults to the `saves.*` convention. */
  functions?: ConvexSaveFunctions;
  /** Prefix every key so multiple games or users can share one `saves` table. */
  namespace?: string;
}

/**
 * A cloud {@link SaveBackend} backed by Convex — reads through a query and
 * writes through mutations, so a {@link createSaveStore} configured with it
 * saves to the server instead of `localStorage`. The only change from an offline
 * game is swapping the backend; autosave, slots, and migration behave the same. A rejected query
 * or mutation reaches the save store as a `failed` result.
 *
 * @capability convex-save save a game to Convex (cloud) through the SaveBackend seam
 */
export function createConvexSaveBackend(options: ConvexSaveBackendOptions): SaveBackend {
  const functions = options.functions ?? defaultConvexSaveFunctions();
  const prefix = options.namespace === undefined ? "" : `${options.namespace}:`;
  const scope = (key: string): string => `${prefix}${key}`;
  return remoteSaveBackend({
    read: (key) => options.client.query(functions.read, { key: scope(key) }),
    write: (key, value) => options.client.mutation(functions.write, { key: scope(key), value }).then(() => undefined),
    remove: (key) => options.client.mutation(functions.remove, { key: scope(key) }).then(() => undefined),
    keys: async (keyPrefix) => (await options.client.query(functions.keys, { prefix: scope(keyPrefix) })).map((key) => key.slice(prefix.length)),
  });
}
