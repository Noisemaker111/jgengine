import { describe, expect, test } from "bun:test";
import { createAssetStreamingSystem, type AssetLoadResult } from "@jgengine/core/visibility/assetStreaming";

async function loadAll(system: ReturnType<typeof createAssetStreamingSystem>, ids: string[]) {
  for (const id of ids) system.request(id);
  system.tick(0);
  await system.settle();
}

describe("asset residency", () => {
  test("byte pressure overrides grace and small-cache retention within the unload budget", async () => {
    const unloaded: string[] = [];
    const system = createAssetStreamingSystem({
      now: () => 0,
      settings: { maxResidentBytes: 100, maxUnloadsPerFrame: 1 },
      load: async () => ({ bytes: 60 }),
      unload: (id) => unloaded.push(id),
    });
    await loadAll(system, ["c", "b", "a"]);
    expect(system.stats()).toMatchObject({ bytes: 180, overBudgetBytes: 80, budgetEvicted: 0 });
    system.tick(0);
    expect(unloaded).toEqual(["a"]);
    expect(system.stats()).toMatchObject({ bytes: 120, overBudgetBytes: 20, budgetEvicted: 1 });
    system.tick(0);
    expect(unloaded).toEqual(["a", "b"]);
    expect(system.stats()).toMatchObject({ bytes: 60, overBudgetBytes: 0, budgetEvicted: 2, unloaded: 2 });
    expect(system.record("a")?.value).toBeUndefined();
    system.clear();
    expect(unloaded).toEqual(["a", "b", "c"]);
    expect(system.stats()).toMatchObject({ bytes: 0, records: 0, budgetEvicted: 0 });
  });

  test("protects references and pins, exposes unavoidable excess, and converges after release", async () => {
    const system = createAssetStreamingSystem({
      settings: { maxResidentBytes: 50, maxUnloadsPerFrame: 4 },
      load: async () => ({ bytes: 60 }),
    });
    system.retain("shared");
    system.retain("shared");
    system.pin("pinned");
    await loadAll(system, ["shared", "pinned", "idle"]);
    system.tick(0);
    expect(system.stats()).toMatchObject({ bytes: 120, protectedBytes: 120, overBudgetBytes: 70, budgetEvicted: 1 });
    system.release("shared");
    system.tick(0);
    expect(system.isLoaded("shared")).toBe(true);
    system.release("shared");
    system.tick(0);
    expect(system.isLoaded("shared")).toBe(false);
    expect(system.stats()).toMatchObject({ bytes: 60, protectedBytes: 60, overBudgetBytes: 10 });
    system.unpin("pinned");
    system.tick(0);
    expect(system.stats()).toMatchObject({ bytes: 0, protectedBytes: 0, overBudgetBytes: 0 });
  });

  test("oldest policy respects refreshed activity and largest policy can be retuned live", async () => {
    let now = 0;
    const unloaded: string[] = [];
    const system = createAssetStreamingSystem({
      now: () => now,
      settings: { maxResidentBytes: 200, maxUnloadsPerFrame: 1 },
      load: async (id) => ({ bytes: id === "large" ? 100 : 40 }),
      unload: (id) => unloaded.push(id),
    });
    await loadAll(system, ["old"]);
    now = 1;
    await loadAll(system, ["large"]);
    now = 2;
    await loadAll(system, ["recent"]);
    now = 3;
    system.markActive("old");
    system.retune({ maxResidentBytes: 150 });
    system.tick(0);
    expect(unloaded).toEqual(["large"]);
    system.retune({ maxResidentBytes: 200 });
    await loadAll(system, ["large"]);
    system.retune({ maxResidentBytes: 150, residentEvictionOrder: "largest" });
    system.tick(0);
    expect(unloaded).toEqual(["large", "large"]);
    expect(system.stats().bytes).toBe(80);
  });

  test("unknown and invalid loader sizes cannot poison the budget", async () => {
    const sizes = new Map<string, number | undefined>([["missing", undefined], ["nan", NaN], ["negative", -2], ["infinite", Infinity], ["zero", 0], ["known", 20]]);
    const system = createAssetStreamingSystem({
      settings: { maxLoadsPerFrame: 6, maxConcurrentLoads: 6, maxResidentBytes: 0, maxUnloadsPerFrame: 6 },
      load: async (id) => ({ bytes: sizes.get(id) }),
    });
    await loadAll(system, [...sizes.keys()]);
    expect(system.stats()).toMatchObject({ bytes: 20, unknownSizeLoaded: 4, overBudgetBytes: 20 });
    system.tick(0);
    expect(system.stats()).toMatchObject({ bytes: 0, unknownSizeLoaded: 4, budgetEvicted: 1 });
  });

  test("invalid residency retuning leaves the old policy intact", async () => {
    const system = createAssetStreamingSystem({ settings: { maxResidentBytes: 100 }, load: async () => ({ bytes: 20 }) });
    for (const maxResidentBytes of [-1, NaN, -Infinity]) {
      expect(() => system.retune({ maxResidentBytes })).toThrow(RangeError);
      expect(() => createAssetStreamingSystem({ settings: { maxResidentBytes }, load: async () => ({}) })).toThrow(RangeError);
    }
    expect(() => system.retune({ residentEvictionOrder: "random" as "oldest" })).toThrow(RangeError);
    await loadAll(system, ["a"]);
    system.tick(0);
    expect(system.isLoaded("a")).toBe(true);
  });

  test("forget is explicit and refuses live ownership, demand and cancelled unresolved work", async () => {
    let resolve!: (result: AssetLoadResult) => void;
    const system = createAssetStreamingSystem({ load: () => new Promise((ok) => { resolve = ok; }) });
    expect(system.forget("missing")).toBe(false);
    system.retain("owned");
    system.pin("pinned");
    system.request("queued");
    expect(system.forget("owned")).toBe(false);
    expect(system.forget("pinned")).toBe(false);
    expect(system.forget("queued")).toBe(false);
    system.tick(0);
    expect(system.forget("queued")).toBe(false);
    system.cancel("queued");
    expect(system.forget("queued")).toBe(false);
    resolve({ bytes: 20, value: "stale" });
    await system.settle();
    const old = system.record("queued")!;
    expect(system.stateOf("queued")).toBe("unloaded");
    expect(system.forget("queued")).toBe(true);
    expect(system.stateOf("queued")).toBeUndefined();
    system.request("queued");
    expect(system.record("queued")).not.toBe(old);
    expect(old.state).toBe("unloaded");
    system.release("owned");
    system.unpin("pinned");
    expect(system.forget("owned")).toBe(true);
    expect(system.forget("pinned")).toBe(true);
  });

  test("forget rejects loaded history but permits errors and eviction history", async () => {
    const system = createAssetStreamingSystem({
      settings: { maxResidentBytes: 0 },
      load: async (id) => { if (id === "error") throw new Error("failed"); return { bytes: 20 }; },
    });
    await loadAll(system, ["loaded", "error"]);
    expect(system.forget("loaded")).toBe(false);
    expect(system.forget("error")).toBe(true);
    system.tick(0);
    expect(system.forget("loaded")).toBe(true);
    expect(system.stats().records).toBe(0);
  });

  test("clear and same-id retry cannot admit stale resident bytes", async () => {
    let resolve!: (result: AssetLoadResult) => void;
    let calls = 0;
    const unloaded: string[] = [];
    const system = createAssetStreamingSystem({
      settings: { maxResidentBytes: 10, maxConcurrentLoads: 1 },
      load: () => ++calls === 1 ? new Promise((ok) => { resolve = ok; }) : Promise.resolve({ bytes: 10, value: "current" }),
      unload: (id) => unloaded.push(id),
    });
    system.request("same");
    system.tick(0);
    system.clear();
    system.request("same");
    system.tick(0);
    expect(calls).toBe(1);
    resolve({ bytes: 1_000, value: "stale" });
    await system.settle();
    expect(system.stats()).toMatchObject({ bytes: 0, loaded: 0, records: 1, queued: 1, budgetEvicted: 0 });
    expect(unloaded).toEqual(["same"]);
    system.tick(0);
    await system.settle();
    system.tick(0);
    expect(system.stats()).toMatchObject({ bytes: 10, loaded: 1, overBudgetBytes: 0, budgetEvicted: 0 });
    expect(system.record("same")?.value).toBe("current");
  });

  test("10,000 cancelled demands and released residents stay bounded with explicit forgetting", async () => {
    const system = createAssetStreamingSystem({
      settings: { maxResidentBytes: 64, maxUnloadsPerFrame: 1, maxLoadsPerFrame: 1 },
      load: async () => ({ bytes: 64 }),
    });
    system.pin("shared");
    await loadAll(system, ["shared"]);
    for (let i = 0; i < 10_000; i++) {
      const id = `asset-${i}`;
      system.request(id);
      system.cancel(id);
      expect(system.forget(id)).toBe(true);
      system.retain(id);
      system.request(id);
      system.tick(0);
      if (i % 3 === 0) system.cancel(id);
      await system.settle();
      system.release(id);
      system.tick(0);
      expect(system.forget(id)).toBe(true);
      expect(system.stats()).toMatchObject({ records: 1, queued: 0, inFlight: 0, loaded: 1, bytes: 64, overBudgetBytes: 0 });
    }
    expect(system.stats().budgetEvicted).toBe(6_666);
    expect(system.isLoaded("shared")).toBe(true);
  });
});
