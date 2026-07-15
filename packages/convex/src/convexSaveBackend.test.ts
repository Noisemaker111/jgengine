import { describe, expect, test } from "bun:test";
import type { ConvexReactClient } from "convex/react";

import { createSaveStore } from "@jgengine/core/game/saveStore";

import { createConvexSaveBackend } from "./convexSaveBackend";

function stubClient(): { client: ConvexReactClient; table: Map<string, string> } {
  const table = new Map<string, string>();
  const client = {
    query: (_ref: unknown, args: { key: string }) => Promise.resolve(table.get(args.key) ?? null),
    mutation: (_ref: unknown, args: { key: string; value?: string }) => {
      if (args.value === undefined) table.delete(args.key);
      else table.set(args.key, args.value);
      return Promise.resolve(null);
    },
  } as unknown as ConvexReactClient;
  return { client, table };
}

describe("createConvexSaveBackend", () => {
  test("round-trips a save through the Convex client", async () => {
    const { client, table } = stubClient();
    const backend = createConvexSaveBackend({ client, namespace: "tower-guard:u1" });
    const store = createSaveStore({ backend, initial: { wave: 0 } });

    store.set({ wave: 12 });
    await store.save();
    expect([...table.keys()].some((key) => key.startsWith("tower-guard:u1:"))).toBe(true);

    const reopened = createSaveStore({ backend, initial: { wave: 0 } });
    expect(await reopened.load()).toEqual({ wave: 12 });
  });

  test("clear removes the stored save", async () => {
    const { client, table } = stubClient();
    const backend = createConvexSaveBackend({ client });
    const store = createSaveStore({ backend, initial: 1 });
    store.set(5);
    await store.save();
    await store.clear();
    expect([...table.values()].some((value) => value.includes("5"))).toBe(false);
  });
});
