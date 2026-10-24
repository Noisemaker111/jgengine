import { describe, expect, test } from "bun:test";

import { clearOriginStorage } from "./capture-storage";

/**
 * A warm daemon keeps its browser profile, so a capture must clear this origin's storage before it
 * navigates — otherwise the same command renders a resumed save instead of a first run.
 */
describe("capture storage clearing", () => {
  test("asks Chrome for this origin's storage before the first navigation", async () => {
    const sent: { method: string; params: unknown }[] = [];
    const session = {
      send: async (method: string, params: unknown) => {
        sent.push({ method, params });
        return {};
      },
    };
    await clearOriginStorage(session as never, "http://127.0.0.1:4517");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.method).toBe("Storage.clearDataForOrigin");
    expect(sent[0]!.params).toMatchObject({
      origin: "http://127.0.0.1:4517",
      storageTypes: "local_storage,indexeddb,websql,cache_storage,service_workers",
    });
  });

  test("a Chrome without the verb warns instead of failing the capture", async () => {
    const warned: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => warned.push(args.map(String).join(" "));
    try {
      await clearOriginStorage(
        { send: async () => { throw new Error("Method not found"); } } as never,
        "http://127.0.0.1:4517",
      );
    } finally {
      console.error = original;
    }
    expect(warned).toHaveLength(1);
    expect(warned[0]).toContain("could not clear http://127.0.0.1:4517 storage");
  });
});
