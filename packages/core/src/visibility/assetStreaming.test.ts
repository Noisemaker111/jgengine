import { describe, expect, test } from "bun:test";
import type { AssetLoadResult } from "@jgengine/core/visibility/assetStreaming";
import { createAssetStreamingSystem } from "@jgengine/core/visibility/assetStreaming";
import { createVisibilityStats } from "@jgengine/core/visibility/diagnostics";

function deferredLoad() {
  let resolve!: (result: AssetLoadResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<AssetLoadResult>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

describe("assetStreaming", () => {
  test("frame starts and retunable concurrency limits apply independently", async () => {
    const loads = Array.from({ length: 4 }, deferredLoad);
    let calls = 0;
    const system = createAssetStreamingSystem({
      settings: { maxLoadsPerFrame: 1, maxConcurrentLoads: 2 },
      load: () => loads[calls++]!.promise,
    });
    for (let i = 0; i < 4; i++) system.request(`a${i}`);
    system.tick(0);
    expect(calls).toBe(1);
    system.tick(0);
    system.tick(0);
    expect(calls).toBe(2);
    system.retune({ maxConcurrentLoads: 1 });
    system.tick(0);
    expect(system.stats().inFlight).toBe(2);
    loads[0]!.resolve({});
    loads[1]!.resolve({});
    await system.settle();
    system.retune({ maxConcurrentLoads: 0 });
    system.tick(0);
    expect(calls).toBe(2);
    system.retune({ maxConcurrentLoads: 2, maxLoadsPerFrame: 2 });
    system.tick(0);
    expect(calls).toBe(4);
    loads[2]!.resolve({});
    loads[3]!.resolve({});
    await system.settle();
  });

  test("rejects invalid concurrency limits without changing live policy", async () => {
    const pending = deferredLoad();
    let calls = 0;
    const system = createAssetStreamingSystem({
      settings: { maxConcurrentLoads: 1 },
      load: () => { calls++; return pending.promise; },
    });
    for (const limit of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => createAssetStreamingSystem({ settings: { maxConcurrentLoads: limit }, load: async () => ({}) })).toThrow(RangeError);
      expect(() => system.retune({ maxConcurrentLoads: limit })).toThrow(RangeError);
    }
    system.request("a");
    system.request("b");
    system.tick(0);
    system.tick(0);
    expect(calls).toBe(1);
    pending.resolve({});
    await system.settle();
  });

  test("stalled loads stay within the concurrency limit across repeated ticks", async () => {
    const loads = Array.from({ length: 6 }, deferredLoad);
    const started: string[] = [];
    const system = createAssetStreamingSystem({
      settings: { maxConcurrentLoads: 2 },
      load: (id) => { started.push(id); return loads[started.length - 1]!.promise; },
    });
    for (let i = 0; i < 6; i++) system.request(`a${i}`, i);
    for (let i = 0; i < 100; i++) system.tick(0);
    expect(started).toEqual(["a5", "a4"]);
    expect(system.stats().inFlight).toBe(2);
    expect(system.stats().queued).toBe(4);
    loads[0]!.resolve({ bytes: 1 });
    loads[1]!.reject(new Error("failed"));
    await system.settle();
    system.tick(0);
    expect(started).toEqual(["a5", "a4", "a3", "a2"]);
    for (const load of loads) load.resolve({ bytes: 1 });
    await system.settle();
  });

  test("cancelled work holds capacity and same-id retries until it settles", async () => {
    const first = deferredLoad(), retry = deferredLoad();
    const unloaded: string[] = [];
    let calls = 0;
    const system = createAssetStreamingSystem({
      settings: { maxConcurrentLoads: 2 },
      unload: (id) => unloaded.push(id),
      load: () => (++calls === 1 ? first.promise : retry.promise),
    });
    system.request("a");
    system.tick(0);
    system.cancel("a");
    system.cancel("a");
    system.request("a");
    system.tick(0);
    expect(calls).toBe(1);
    expect(system.stats().inFlight).toBe(1);
    expect(system.stats().cancelled).toBe(1);
    first.resolve({ bytes: 100, value: "stale" });
    await system.settle();
    expect(system.stateOf("a")).toBe("queued");
    expect(unloaded).toEqual(["a"]);
    system.tick(0);
    expect(calls).toBe(2);
    retry.resolve({ bytes: 200, value: "current" });
    await system.settle();
    expect(system.record("a")?.value).toBe("current");
  });

  test("clear releases resident resources but tracks cancelled work until settlement", async () => {
    const pending = deferredLoad();
    const unloaded: string[] = [];
    let calls = 0;
    const system = createAssetStreamingSystem({
      settings: { maxConcurrentLoads: 1 },
      unload: (id) => unloaded.push(id),
      load: () => (++calls === 1 ? Promise.resolve({ bytes: 1 }) : pending.promise),
    });
    system.request("loaded");
    system.tick(0);
    await system.settle();
    system.pin("loaded");
    system.retain("loaded");
    system.request("pending");
    system.tick(0);
    system.clear();
    system.clear();
    expect(unloaded).toEqual(["loaded"]);
    expect(system.stats().inFlight).toBe(1);
    system.request("pending");
    system.tick(0);
    expect(calls).toBe(2);
    let settled = false;
    const settling = system.settle().then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    pending.resolve({ bytes: 10 });
    await settling;
    expect(system.stateOf("pending")).toBe("queued");
    expect(unloaded).toEqual(["loaded", "pending"]);
    expect(system.stats().inFlight).toBe(0);
  });

  test("synchronous loader failures release their slot and become errors", async () => {
    const system = createAssetStreamingSystem({
      settings: { maxConcurrentLoads: 1 },
      load: (id) => { if (id === "bad") throw new Error("failed"); return Promise.resolve({ bytes: 1 }); },
    });
    system.request("bad", 10);
    system.request("good");
    expect(() => system.tick(0)).not.toThrow();
    await system.settle();
    expect(system.stateOf("bad")).toBe("error");
    expect(system.stats().inFlight).toBe(0);
    system.tick(0);
    await system.settle();
    expect(system.isLoaded("good")).toBe(true);
  });

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
