import { describe, expect, test } from "bun:test";
import type { AssetLoadResult } from "@jgengine/core/visibility/assetStreaming";
import { createAssetStreamingSystem } from "@jgengine/core/visibility/assetStreaming";
import { createVisibilityStats } from "@jgengine/core/visibility/diagnostics";

describe("assetStreaming", () => {
  test("request, tick, settle resolves to loaded", async () => {
    let t = 0;
    const system = createAssetStreamingSystem({
      now: () => t,
      load: async () => ({ bytes: 100 }),
    });
    system.request("a");
    system.tick(0);
    await system.settle();
    expect(system.stateOf("a")).toBe("loaded");
    expect(system.isLoaded("a")).toBe(true);
  });

  test("requesting the same asset twice only loads it once", async () => {
    let t = 0;
    let calls = 0;
    const system = createAssetStreamingSystem({
      now: () => t,
      load: async () => {
        calls += 1;
        return { bytes: 10 };
      },
    });
    system.request("a");
    system.request("a", 5);
    system.tick(0);
    await system.settle();
    expect(calls).toBe(1);
    expect(system.stateOf("a")).toBe("loaded");
  });

  test("tick starts only up to maxLoadsPerFrame loads, the rest stay queued", async () => {
    let t = 0;
    const started: string[] = [];
    const system = createAssetStreamingSystem({
      now: () => t,
      load: async (id) => {
        started.push(id);
        return { bytes: 1 };
      },
    });
    const ids = Array.from({ length: 6 }, (_, i) => `a${i}`);
    for (const id of ids) system.request(id);
    system.tick(0);
    expect(started.length).toBe(4);
    const queuedCount = ids.filter((id) => system.stateOf(id) === "queued").length;
    expect(queuedCount).toBe(2);
    await system.settle();
  });

  test("higher priority assets load first within the budget", async () => {
    let t = 0;
    const started: string[] = [];
    const system = createAssetStreamingSystem({
      now: () => t,
      settings: { maxLoadsPerFrame: 1 },
      load: async (id) => {
        started.push(id);
        return { bytes: 1 };
      },
    });
    system.request("low", 1);
    system.request("high", 10);
    system.tick(0);
    expect(started).toEqual(["high"]);
    expect(system.stateOf("low")).toBe("queued");
    await system.settle();
  });

  test("pin prevents an idle loaded asset from being evicted", async () => {
    let t = 0;
    const unloaded: string[] = [];
    const system = createAssetStreamingSystem({
      now: () => t,
      unload: (id) => unloaded.push(id),
      settings: { unloadGraceSeconds: 1, keepResidentBytes: 0 },
      load: async () => ({ bytes: 1000 }),
    });
    system.request("a");
    system.tick(0);
    await system.settle();
    system.pin("a");
    t += 5000;
    system.tick(0);
    expect(system.stateOf("a")).toBe("loaded");
    expect(unloaded).not.toContain("a");
  });

  test("retain prevents an idle loaded asset from being evicted", async () => {
    let t = 0;
    const unloaded: string[] = [];
    const system = createAssetStreamingSystem({
      now: () => t,
      unload: (id) => unloaded.push(id),
      settings: { unloadGraceSeconds: 1, keepResidentBytes: 0 },
      load: async () => ({ bytes: 1000 }),
    });
    system.request("a");
    system.tick(0);
    await system.settle();
    system.retain("a");
    t += 5000;
    system.tick(0);
    expect(system.stateOf("a")).toBe("loaded");
    expect(unloaded).not.toContain("a");
  });

  test("an idle loaded asset is evicted after the grace period", async () => {
    let t = 0;
    const unloaded: string[] = [];
    const system = createAssetStreamingSystem({
      now: () => t,
      unload: (id) => unloaded.push(id),
      settings: { unloadGraceSeconds: 1, keepResidentBytes: 0 },
      load: async () => ({ bytes: 1000 }),
    });
    system.request("a");
    system.tick(0);
    await system.settle();
    t += 1500;
    system.tick(0);
    expect(system.stateOf("a")).toBe("unloaded");
    expect(unloaded).toContain("a");
  });

  test("small assets stay resident past the grace period", async () => {
    let t = 0;
    const unloaded: string[] = [];
    const system = createAssetStreamingSystem({
      now: () => t,
      unload: (id) => unloaded.push(id),
      settings: { unloadGraceSeconds: 1 },
      load: async () => ({ bytes: 10 }),
    });
    system.request("a");
    system.tick(0);
    await system.settle();
    t += 5000;
    system.tick(0);
    expect(system.stateOf("a")).toBe("loaded");
    expect(unloaded).not.toContain("a");
  });

  test("cancel removes a queued asset", () => {
    let t = 0;
    const system = createAssetStreamingSystem({ now: () => t, load: async () => ({ bytes: 1 }) });
    system.request("a");
    expect(system.stateOf("a")).toBe("queued");
    system.cancel("a");
    expect(system.stateOf("a")).toBe("unloaded");
    system.tick(0);
    expect(system.stateOf("a")).toBe("unloaded");
  });

  test("cancelling an in-flight load prevents it from committing", async () => {
    let t = 0;
    let resolveLoad: ((result: AssetLoadResult) => void) | undefined;
    const system = createAssetStreamingSystem({
      now: () => t,
      load: () => new Promise<AssetLoadResult>((resolve) => {
        resolveLoad = resolve;
      }),
    });
    system.request("a");
    system.tick(0);
    expect(system.stateOf("a")).toBe("loading");
    system.cancel("a");
    resolveLoad?.({ bytes: 100 });
    await system.settle();
    expect(system.stateOf("a")).not.toBe("loaded");
  });

  test("stats reports queued, loaded, and errored counts", async () => {
    let t = 0;
    const system = createAssetStreamingSystem({
      now: () => t,
      settings: { maxLoadsPerFrame: 1 },
      load: async (id) => {
        if (id === "err") throw new Error("fail");
        return { bytes: 5 };
      },
    });
    system.request("err", 10);
    system.request("waiting", 0);
    system.tick(0);
    await system.settle();
    system.tick(0);
    await system.settle();
    const stats = system.stats();
    expect(stats.errored).toBe(1);
    expect(stats.loaded).toBe(1);
    expect(stats.queued).toBe(0);
  });

  test("applyTo writes asset fields onto a VisibilityStats object", async () => {
    let t = 0;
    const system = createAssetStreamingSystem({ now: () => t, load: async () => ({ bytes: 42 }) });
    system.request("a");
    system.tick(0);
    await system.settle();
    const stats = createVisibilityStats();
    system.applyTo(stats);
    expect(stats.assetsLoaded).toBe(1);
    expect(stats.streamedBytes).toBe(42);
  });
});
