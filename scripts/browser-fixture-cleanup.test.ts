import { expect, test } from "bun:test";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupBrowserFixture } from "./browser-fixture-cleanup";

test("owned force kill drains a held response, HTTP server and scratch without awaiting graceful close", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "browser-fixture-cleanup-"));
  await writeFile(join(scratch, "fixture.js"), "owned fixture");
  let releaseResponse!: () => void;
  let saveReleased = false;
  let sawRequest!: () => void;
  const requested = new Promise<void>((resolve) => { sawRequest = resolve; });
  const response = new Promise<Response>((resolve) => {
    releaseResponse = () => { saveReleased = true; resolve(new Response("released")); };
  });
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => { sawRequest(); return response; } });
  const request = fetch(`http://127.0.0.1:${server.port}`).then((value) => value.text()).catch(() => undefined);
  await requested;
  let gracefulCalls = 0;
  let releaseGraceful!: () => void;
  const stalledClose = new Promise<void>((resolve) => { releaseGraceful = resolve; });
  const owned = { killed: false, close: () => { gracefulCalls++; return stalledClose; }, kill: async () => { owned.killed = true; } };
  const unrelated = { killed: false };
  let removed = false;
  let stopped = false;
  const cleanup = cleanupBrowserFixture({
    releasePending: releaseResponse,
    browserServer: owned,
    server: { stop: async (force) => { expect(force).toBe(true); await server.stop(force); stopped = true; } },
    removeScratch: async () => { await rm(scratch, { recursive: true, force: true }); removed = true; },
  });
  try {
    // Let immediately settled cleanup operations run; no timeout or browser launch.
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(owned.killed).toBe(true);
    await cleanup;
    expect(gracefulCalls).toBe(0);
    expect(saveReleased).toBe(true);
    expect(unrelated.killed).toBe(false);
    expect(stopped).toBe(true);
    expect(removed).toBe(true);
    await expect(stat(scratch)).rejects.toThrow();
  } finally {
    releaseResponse();
    releaseGraceful();
    await cleanup;
    await server.stop(true);
    await rm(scratch, { recursive: true, force: true });
    await request;
  }
});

test("partial startup still removes its scratch and stops an acquired HTTP server", async () => {
  const calls: string[] = [];
  await cleanupBrowserFixture({ removeScratch: async () => { calls.push("scratch-only"); } });
  await cleanupBrowserFixture({
    server: { stop: (force) => { expect(force).toBe(true); calls.push("server"); } },
    removeScratch: async () => { calls.push("scratch-with-server"); },
  });
  expect(calls).toEqual(["scratch-only", "server", "scratch-with-server"]);
});

test("all acquired resources drain after failures and the original first error is rethrown", async () => {
  const first = new Error("held-save release failed");
  const calls: string[] = [];
  let caught: unknown;
  try {
    await cleanupBrowserFixture({
      releasePending: () => { calls.push("save"); throw first; },
      browserServer: { kill: async () => { calls.push("browser"); throw new Error("kill failed"); } },
      server: { stop: () => { calls.push("http"); throw new Error("stop failed"); } },
      removeScratch: async () => { calls.push("scratch"); throw new Error("remove failed"); },
    });
  } catch (failure) { caught = failure; }
  expect(caught).toBe(first);
  expect(calls).toEqual(["save", "browser", "http", "scratch"]);
});

test("an owned kill failure does not skip scratch cleanup", async () => {
  const first = new Error("owned child did not exit");
  let removed = false;
  await expect(cleanupBrowserFixture({
    browserServer: { kill: async () => { throw first; } },
    removeScratch: async () => { removed = true; },
  })).rejects.toBe(first);
  expect(removed).toBe(true);
});

test("undefined thrown by the first cleanup remains a failure after later cleanup errors", async () => {
  const calls: string[] = [];
  let failed = false;
  let caught: unknown = "no failure";
  try {
    await cleanupBrowserFixture({
      releasePending: () => { calls.push("save"); throw undefined; },
      removeScratch: async () => { calls.push("scratch"); throw new Error("later failure"); },
    });
  } catch (failure) { failed = true; caught = failure; }
  expect(failed).toBe(true);
  expect(caught).toBeUndefined();
  expect(calls).toEqual(["save", "scratch"]);
});
