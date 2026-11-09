import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, test } from "bun:test";

import { beginPause, currentStep, endPause, markStep, pausableDeadline, pausedTotal, STEP_FILE_ENV } from "./hangReport";
import { acquirePerfLock, perfLockHolder, perfLockTurn, STALE_HEARTBEAT_MS, waitingLine } from "./perf-lock";

const dir = join(tmpdir(), `jg-perf-lock-${process.pid}`);
mkdirSync(dir, { recursive: true });
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let n = 0;
const lockPath = (): string => join(dir, `lock-${(n += 1)}`, "perf.lock");
const moduleUrl = new URL("./perf-lock.ts", import.meta.url).href;

/** A separate process that takes the lock, holds it `holdMs`, and prints when it held it. */
function holder(path: string, name: string, holdMs: number): Promise<{ start: number; end: number; stderr: string }> {
  const code = `
    const { acquirePerfLock } = await import(${JSON.stringify(moduleUrl)});
    const release = await acquirePerfLock(${JSON.stringify(name)}, { path: ${JSON.stringify(path)}, pollMs: 25, branch: ${JSON.stringify(name)} });
    const start = Date.now();
    await new Promise((r) => setTimeout(r, ${holdMs}));
    const end = Date.now();
    release();
    console.log(JSON.stringify({ start, end }));
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", code], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += String(chunk)));
    child.stderr.on("data", (chunk) => (stderr += String(chunk)));
    child.on("error", reject);
    child.on("exit", (exit) => {
      if (exit !== 0) return reject(new Error(`${name} exited ${exit}: ${stderr}`));
      resolve({ ...(JSON.parse(stdout.trim()) as { start: number; end: number }), stderr });
    });
  });
}

describe("perf lock", () => {
  test("two processes never hold it at once; the second says who it waits for, then runs", async () => {
    const path = lockPath();
    // Held longer than a bun start on a saturated PC (over 2 s seen), so the second really waits.
    const first = holder(path, "agent/first", 8_000);
    // The second starts once the first holds the lock, so the order is fixed.
    for (let i = 0; i < 200 && perfLockHolder(path) === null; i += 1) await Bun.sleep(25);
    expect(perfLockHolder(path)?.branch).toBe("agent/first");
    const second = holder(path, "agent/second", 100);
    const [a, b] = await Promise.all([first, second]);
    expect(b.start).toBeGreaterThanOrEqual(a.end);
    expect(b.stderr).toMatch(/^perf lock: waiting for pid \d+ \(agent\/first: agent\/first, since \d\d:\d\d\) …$/m);
    expect(b.stderr).toMatch(/^perf lock: taken for agent\/second after waiting \d+ s$/m);
    // It starts as soon as the lock frees, not on a slow poll.
    expect(b.start - a.end).toBeLessThan(1_000);
    expect(existsSync(path)).toBe(false);
  }, 30_000);

  test("a holder whose process is gone is taken over with a degraded line", async () => {
    const path = lockPath();
    const dead = spawnSync(process.execPath, ["-e", "0"]).pid;
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, JSON.stringify({ pid: dead, branch: "agent/crashed", what: "perf deepward", cwd: dir, since: Date.now() - 60_000, token: "old" }));
    const lines: string[] = [];
    const release = await acquirePerfLock("perf deepward", { path, log: (line) => lines.push(line), isAlive: (pid) => pid !== dead, branch: "agent/next" });
    expect(lines[0]).toMatch(/^degraded: stale perf lock held by agent\/crashed \(pid \d+, since \d\d:\d\d\): its process is gone; taking it over$/);
    expect(perfLockHolder(path)?.branch).toBe("agent/next");
    release();
    expect(existsSync(path)).toBe(false);
  });

  test("a live pid that stopped touching the lock (a reused pid) is stale too", async () => {
    const path = lockPath();
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, JSON.stringify({ pid: process.pid, branch: "agent/frozen", what: "", cwd: dir, since: 0, token: "old" }));
    const old = new Date(Date.now() - STALE_HEARTBEAT_MS - 5_000);
    utimesSync(path, old, old);
    const lines: string[] = [];
    const release = await acquirePerfLock("perf deepward", { path, log: (line) => lines.push(line), branch: "agent/next" });
    expect(lines[0]).toStartWith("degraded: stale perf lock held by agent/frozen");
    expect(lines[0]).toContain("has not touched the lock");
    release();
  });

  test("a newcomer waits behind an older waiter's live ticket and goes once that waiter is gone", async () => {
    const path = lockPath();
    const queue = `${path}.queue`;
    mkdirSync(queue, { recursive: true });
    // An older waiter (pid 4242) queued first; the lock itself is free.
    writeFileSync(join(queue, `${String(1).padStart(15, "0")}-4242`), "4242");
    let olderAlive = true;
    setTimeout(() => (olderAlive = false), 400);
    const started = Date.now();
    const release = await acquirePerfLock("perf deepward", { path, pollMs: 25, isAlive: (pid) => (pid === 4242 ? olderAlive : true), branch: "agent/new" });
    expect(Date.now() - started).toBeGreaterThanOrEqual(350);
    // The dead ticket was removed and this process's own ticket dropped once it held the lock.
    expect(existsSync(join(queue, `${String(1).padStart(15, "0")}-4242`))).toBe(false);
    expect(readdirSync(queue)).toEqual([]);
    release();
  });

  test("it is re-entrant within one process and freed by the outermost release", async () => {
    const path = lockPath();
    const outer = await acquirePerfLock("perf native deepward", { path });
    const inner = await acquirePerfLock("perf desktop deepward.exe", { path });
    inner();
    expect(perfLockHolder(path)?.what).toBe("perf native deepward");
    outer();
    expect(perfLockHolder(path)).toBeNull();
  });

  test("a session turn takes the lock before the shared browser's turn and frees both", async () => {
    const path = lockPath();
    const order: string[] = [];
    const turn = perfLockTurn("perf deepward", async () => {
      order.push(perfLockHolder(path) === null ? "broker before lock" : "broker after lock");
      return async () => void order.push("broker released");
    }, { path });
    const release = await turn();
    await release();
    expect(order).toEqual(["broker after lock", "broker released"]);
    expect(perfLockHolder(path)).toBeNull();
  });

  test("the waiting line names pid, branch, run and start time in the form AGENTS.md quotes", () => {
    const since = new Date(2026, 10, 8, 21, 7).getTime();
    expect(waitingLine({ branch: "agent/fps", pid: 4242, since, what: "perf gate harbor-heat" })).toBe("perf lock: waiting for pid 4242 (agent/fps: perf gate harbor-heat, since 21:07) …");
    expect(waitingLine({ branch: "agent/fps", pid: 4242, since })).toBe("perf lock: waiting for pid 4242 (agent/fps, since 21:07) …");
  });
});

describe("deadlines give back time queued for the lock", () => {
  test("a pause pushes a deadline back by its length", async () => {
    let paused = 0;
    let expiredAt = 0;
    const start = Date.now();
    pausableDeadline(100, () => paused, () => (expiredAt = Date.now()));
    paused = 150;
    for (let i = 0; i < 100 && expiredAt === 0; i += 1) await Bun.sleep(20);
    expect(expiredAt - start).toBeGreaterThanOrEqual(240);
  });

  test("the step file carries the pause, the wait in progress included", () => {
    const path = join(dir, "step.json");
    const env = { [STEP_FILE_ENV]: path };
    process.env[STEP_FILE_ENV] = path;
    try {
      beginPause("waiting for perf lock held by agent/x (pid 1, since 10:00)", 1_000);
      const during = JSON.parse(readFileSync(path, "utf8")) as { pausedSince?: number };
      expect(during.pausedSince).toBe(1_000);
      expect(pausedTotal(currentStep(), 4_000)).toBeGreaterThanOrEqual(3_000);
      endPause(5_000);
      markStep("measure", env, 6_000);
      expect(pausedTotal(currentStep(), 9_000)).toBeGreaterThanOrEqual(4_000);
    } finally {
      delete process.env[STEP_FILE_ENV];
    }
  });
});

test("every entry point that times frames takes the lock", () => {
  // Removing one of these calls lets two timed runs overlap again, the failure this lock exists for.
  // The `acquirePerfLock` takers hold it before their server check and Chrome launch, so a queued run
  // has no uncapped browser idling and no server that a long wait can outlive.
  const takers: Record<string, string[]> = {
    "perf-play.ts": ["withPerfLock(`perf ${options.game}`", "acquirePerfLock(`perf ${pending.join"],
    "perf-gate.ts": ["acquirePerfLock(`perf gate"],
    "perf-fps-gap.ts": ["acquirePerfLock(`perf fps-gap"],
    // The audit loop shared by shadow-audit and post-audit.
    "perf-shadow-audit.ts": ["acquirePerfLock(`perf ${kind.name}"],
    "perf-network.ts": ["withPerfLock(`perf network", "acquirePerfLock(`perf network"],
    "perf-desktop.ts": ["withPerfLock(`perf desktop"],
    "perf-native.ts": ["withPerfLock(`perf native"],
    "bench-cpu.ts": ["withPerfLock(\"perf timing\""],
    "drive-dev.ts": ["acquirePerfLock(`drive"],
  };
  for (const [file, calls] of Object.entries(takers)) {
    const source = readFileSync(join(import.meta.dir, file), "utf8");
    for (const call of calls) expect(source, `${file} lost ${call}`).toContain(call);
  }
});

/** Lines a server fetch may sit below the lock take that guards it: the take, its comment and a try. */
const LOCK_TO_SERVER_LINES = 20;

/**
 * Each `await ensure…(` server fetch in `source` that has no lock take in the lines just above it,
 * as `line N`. A fetch guarded that way runs after the wait, whatever the file's shape (one batch,
 * a per-game loop, a shared audit loop).
 */
export function serversBeforeLock(source: string): string[] {
  const lines = source.split(/\r?\n/);
  // A `perfLockTurn` above the fetch means the fetch runs inside the session, after the wait.
  const lockTake = /\b(?:acquirePerfLock|withPerfLock|perfLockTurn)\(/;
  const serverFetch = /\bawait\s+ensure(?:DevServer|WebServer|DaemonTarget)\(/;
  const bad: string[] = [];
  for (const [index, line] of lines.entries()) {
    if (!serverFetch.test(line)) continue;
    const above = lines.slice(Math.max(0, index - LOCK_TO_SERVER_LINES), index + 1);
    if (!above.some((candidate) => lockTake.test(candidate))) bad.push(`line ${index + 1}`);
  }
  return bad;
}

test("every script that takes the perf lock asks for its dev server only under it", () => {
  // A server asked for before a long wait for the lock was gone after it: the run failed on
  // ERR_CONNECTION_REFUSED (perf play after 503 s, fps-gap's fernwild, 2026-11-08). Every script that
  // takes the lock is checked, so a new timed script cannot bring the order back.
  const scripts = readdirSync(import.meta.dir).filter((name) => /\.ts$/.test(name) && !/\.test\.ts$/.test(name) && name !== "perf-lock.ts");
  const takers = scripts.filter((name) => /\b(?:acquirePerfLock|withPerfLock|perfLockTurn)\(/.test(readFileSync(join(import.meta.dir, name), "utf8")));
  // The ones that start a dev server; perf desktop, native and timing start none inside the lock.
  for (const file of ["perf-play.ts", "perf-gate.ts", "perf-fps-gap.ts", "perf-shadow-audit.ts", "perf-network.ts", "drive-dev.ts"]) {
    expect(takers, `${file} no longer takes the perf lock`).toContain(file);
  }
  for (const file of takers) {
    expect(serversBeforeLock(readFileSync(join(import.meta.dir, file), "utf8")), `${file} asks for a dev server outside the perf lock at`).toEqual([]);
  }
});

test("the order check flags a server fetched before the lock and passes one fetched under it", () => {
  const before = ["const server = await ensureDevServer(repoRoot);", "const exit = await withBrowserSession({ turn: perfLockTurn(`x`, undefined) }, run);"].join("\n");
  expect(serversBeforeLock(before)).toEqual(["line 1"]);
  const under = ["const release = await acquirePerfLock(`x`);", "// a comment", "const server = await ensureDevServer(repoRoot);"].join("\n");
  expect(serversBeforeLock(under)).toEqual([]);
  const wrapped = ["return withPerfLock(`perf ${kind.name} ${game}`, () => locked(game));", "}", "async function locked(game) {", "  const server = await ensureDevServer(repoRoot);"].join("\n");
  expect(serversBeforeLock(wrapped)).toEqual([]);
  const insideTurn = ["const exit = await withBrowserSession({ turn: perfLockTurn(`x`, undefined) }, async () => {", "  const server = await ensureDevServer(repoRoot);"].join("\n");
  expect(serversBeforeLock(insideTurn)).toEqual([]);
});
