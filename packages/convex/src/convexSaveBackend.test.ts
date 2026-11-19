import { describe, expect, test } from "bun:test";
import type { ConvexReactClient } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";

import { saveBackendContract, type SaveBackendHarness } from "@jgengine/core/save/saveBackendContract";
import { createSaveStore } from "@jgengine/core/save/saveStore";

import { createConvexSaveBackend } from "./convexSaveBackend";

type Faults = { read: number; write: number };

/** A Convex client over one `saves` table that rejects the way a dropped connection or a failed mutation does. */
function stubClient(table: Map<string, string>, faults: Faults): ConvexReactClient {
  const refuse = (operation: keyof Faults): Promise<never> | null => {
    if (faults[operation] === 0) return null;
    faults[operation] -= 1;
    return Promise.reject(new Error(`[CONVEX] ${operation} failed: connection lost`));
  };
  return {
    query: (ref: FunctionReference<"query">, args: { key?: string; prefix?: string }) => {
      const name = getFunctionName(ref);
      if (name === "saves:keys") return Promise.resolve([...table.keys()].filter((key) => key.startsWith(args.prefix ?? "")));
      return refuse("read") ?? Promise.resolve(table.get(args.key ?? "") ?? null);
    },
    mutation: (ref: FunctionReference<"mutation">, args: { key: string; value?: string }) => {
      if (getFunctionName(ref) === "saves:remove") {
        table.delete(args.key);
        return Promise.resolve(null);
      }
      const refused = refuse("write");
      if (refused !== null) return refused;
      table.set(args.key, args.value ?? "");
      return Promise.resolve(null);
    },
  } as unknown as ConvexReactClient;
}

function harness(): SaveBackendHarness {
  const faults: Faults = { read: 0, write: 0 };
  let table = new Map<string, string>();
  return {
    open() {
      table = new Map();
      return createConvexSaveBackend({ client: stubClient(table, faults), namespace: "game:u1" });
    },
    reopen: () => createConvexSaveBackend({ client: stubClient(table, faults), namespace: "game:u1" }),
    failNext: (operation) => void (faults[operation] += 1),
  };
}

describe("Convex save backend", () => {
  for (const check of saveBackendContract(harness())) test(check.name, check.run);

  test("keys stay inside the backend's namespace", async () => {
    const table = new Map<string, string>([["other:u2:save:default", "{}"]]);
    const backend = createConvexSaveBackend({ client: stubClient(table, { read: 0, write: 0 }), namespace: "tower-guard:u1" });
    const store = createSaveStore({ backend, initial: { wave: 0 } });
    store.set({ wave: 12 });
    expect((await store.save()).kind).toBe("saved");
    expect([...table.keys()]).toContain("tower-guard:u1:save:default");
    expect(await store.slots()).toEqual(["default"]);
  });
});
