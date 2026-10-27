import { describe, expect, test } from "bun:test";

import { createAssetPrefetch } from "./assetPrefetch";

function deferred() {
  const pending: { url: string; done: (ok: boolean) => void }[] = [];
  const fetchFile = (url: string) => new Promise<boolean>((resolve) => pending.push({ url, done: resolve }));
  const settle = (index: number, ok: boolean): void => {
    const entry = pending[index];
    if (entry === undefined) throw new Error(`no fetch #${index} started`);
    entry.done(ok);
  };
  return { pending, fetchFile, settle };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("asset prefetch", () => {
  test("fetches near files before far ones, a few at a time, and reports progress", async () => {
    const { pending, fetchFile, settle } = deferred();
    const prefetch = createAssetPrefetch({ fetchFile, resolve: (path) => `/play${path}`, concurrency: 2 });
    prefetch.start([
      { path: "/far.gltf", tier: "far" },
      { path: "/one.glb", tier: "near" },
      { path: "/two.glb", tier: "near" },
    ]);
    expect(pending.map((entry) => entry.url)).toEqual(["/play/one.glb", "/play/two.glb"]);
    expect(prefetch.nearReady()).toBe(false);
    settle(0, true);
    await flush();
    expect(pending.map((entry) => entry.url)).toEqual(["/play/one.glb", "/play/two.glb", "/play/far.gltf"]);
    settle(1, false);
    await flush();
    expect(prefetch.nearReady()).toBe(true);
    expect(prefetch.state()).toEqual({ total: 3, done: 2, failed: 1, nearTotal: 2, nearDone: 2 });
    prefetch.reset();
    expect(prefetch.state().total).toBe(0);
  });

  test("an empty list is ready at once", () => {
    const prefetch = createAssetPrefetch({ fetchFile: async () => true });
    prefetch.start([]);
    expect(prefetch.nearReady()).toBe(true);
  });
});
