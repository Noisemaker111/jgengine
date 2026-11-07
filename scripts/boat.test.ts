import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  backoffMs,
  boatEvent,
  boatMaxMachines,
  classifyLimits,
  classifyStartError,
  lineJoiner,
  readRegistry,
  reapOrphans,
  runOnBoat,
  updateRegistry,
  waitForCapacity,
  type BoatCli,
  type BoatLimits,
  type CliResult,
} from "./boat";

const NOW = Date.parse("2026-11-07T09:00:00Z");
const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function registry(): string {
  const dir = mkdtempSync(join(tmpdir(), "boat-reg-"));
  made.push(dir);
  return join(dir, "boat-machines.json");
}

const ok = (stdout: string): CliResult => ({ status: 0, stdout, stderr: "" });
const listOf = (ids: string[]): string => JSON.stringify({ sandboxes: ids.map((id) => ({ id })) });

/**
 * A boat account in memory: `running` machines belong to other threads until `freeAfterSleeps`
 * sleeps have passed; `boat run` refuses while the account is full, exactly as the real one did
 * (`{"code":"limit_reached","event":"error","status":429}`), and otherwise streams `script`.
 */
function fakeBoat(options: { running?: string[]; freeAfterSleeps?: number; limits?: BoatLimits; script?: string[]; status?: number; limitsFail?: CliResult; refuseFirst?: number }) {
  let now = NOW;
  let sleeps = 0;
  let others = [...(options.running ?? [])];
  const mine: string[] = [];
  const calls: string[][] = [];
  const deleted: string[] = [];
  const leases: string[] = [];
  let refusals = options.refuseFirst ?? 0;
  const running = (): string[] => [...others, ...mine];
  const cli: BoatCli = {
    limits: async () => options.limitsFail ?? ok(JSON.stringify({ activeSandboxes: running().length, maxActiveSandboxes: 2, ...options.limits })),
    list: async () => ok(listOf(running())),
    delete: async (id) => {
      deleted.push(id);
      const at = mine.indexOf(id);
      if (at >= 0) mine.splice(at, 1);
      return ok("");
    },
    lease: async (what) => {
      leases.push(`take ${what}`);
      return { claim: (id: string) => leases.push(`claim ${id}`), release: () => leases.push("release") };
    },
    run: async (args, onLine) => {
      calls.push([...args]);
      if (running().length >= 2 || refusals > 0) {
        refusals = Math.max(0, refusals - 1);
        onLine('{"code":"limit_reached","error":"Trial accounts can run 2 concurrent sandboxes.","event":"error","status":429}');
        return { status: 1 };
      }
      const id = `bx_mine${calls.length}`;
      mine.push(id);
      onLine(JSON.stringify({ event: "created", id, ttlSeconds: 900 }));
      for (const line of options.script ?? []) onLine(JSON.stringify({ type: "stdout", data: `${line}\n` }));
      const status = options.status ?? 0;
      onLine(JSON.stringify({ event: "summary", deleted: true, dollars: 0.0123, elapsedSeconds: 95, exitCode: status, id }));
      mine.splice(mine.indexOf(id), 1);
      return { status };
    },
    sleep: async (ms) => {
      now += ms;
      sleeps += 1;
      if (options.freeAfterSleeps !== undefined && sleeps >= options.freeAfterSleeps) others = [];
    },
    now: () => now,
  };
  return { cli, calls, deleted, leases, sleeps: () => sleeps, waited: () => now - NOW };
}

describe("capacity", () => {
  test("two machines already running is busy; one is ready; the PC's cap holds even when the plan allows more", () => {
    expect(classifyLimits({ maxActiveSandboxes: 2 }, 2, 2, NOW).kind).toBe("busy");
    expect(classifyLimits({ maxActiveSandboxes: 2 }, 1, 2, NOW).kind).toBe("ready");
    expect(classifyLimits({ maxActiveSandboxes: 100, activeSandboxes: 2 }, 2, 2, NOW).kind).toBe("busy");
    expect(boatMaxMachines({})).toBe(2);
    expect(boatMaxMachines({ BOAT_MAX_MACHINES: "1" })).toBe(1);
  });

  test("a start window that frees within the hour is waited for; one that frees later is spent, never unusable", () => {
    const hour = classifyLimits({ startWindowFull: { window: "hour", freesAt: "2026-11-07T09:20:00Z" } }, 0, 2, NOW);
    expect(hour).toMatchObject({ kind: "busy", retryAt: Date.parse("2026-11-07T09:20:00Z") });
    // A rolling day window whose next start ages out in 40 minutes is waited for like the hour one.
    expect(classifyLimits({ startWindowFull: { window: "day", freesAt: "2026-11-07T09:40:00Z" } }, 0, 2, NOW).kind).toBe("busy");
    // Unusable would run the whole Linux suite on this PC; spent stops the landing and says when.
    expect(classifyLimits({ startWindowFull: { window: "day", freesAt: "2026-11-08T03:00:00Z" } }, 0, 2, NOW)).toEqual({
      kind: "spent",
      why: "boat's day start limit is used until 2026-11-08T03:00:00.000Z",
      until: Date.parse("2026-11-08T03:00:00Z"),
    });
    // Boat may name the full window as a start block too; the window decides, not the block.
    expect(classifyLimits({ startBlockedReason: "Daily start limit reached", canStart: false, startWindowFull: { window: "day", freesAt: "2026-11-08T03:00:00Z" } }, 0, 2, NOW).kind).toBe("spent");
    // Every start of the day used and no window named: spent, with no time to give.
    expect(classifyLimits({ starts: { day: { limit: 75, used: 75, remaining: 0 } } }, 0, 2, NOW)).toMatchObject({ kind: "spent", why: expect.stringContaining("all 75 of the day's starts") });
    expect(classifyLimits({ starts: { day: { limit: 75, used: 74, remaining: 1 } } }, 0, 2, NOW).kind).toBe("ready");
    expect(classifyLimits({ trialComputeCapSeconds: 90_000, trialComputeUsedSeconds: 90_000 }, 0, 2, NOW)).toMatchObject({ kind: "unusable", why: expect.stringContaining("compute hours") });
    expect(classifyLimits({ blockedReason: "trial ended" }, 0, 2, NOW)).toMatchObject({ kind: "unusable", why: expect.stringContaining("trial ended") });
  });

  test("a refused start: the at-once limit and rate windows are busy, billing is unusable", () => {
    expect(classifyStartError({ code: "limit_reached", status: 429, error: "Trial accounts can run 2 concurrent sandboxes.\nBilling: …" }, NOW)).toEqual({ kind: "busy", why: "Trial accounts can run 2 concurrent sandboxes." });
    expect(classifyStartError({ code: "rate_limited", retryAfterSeconds: 120 }, NOW)).toMatchObject({ kind: "busy", retryAt: NOW + 120_000 });
    expect(classifyStartError({ code: "rate_limited", error: "Daily start limit reached", nextStartAt: "2026-11-07T15:00:00Z" }, NOW)).toEqual({ kind: "spent", why: "Daily start limit reached", until: Date.parse("2026-11-07T15:00:00Z") });
    expect(classifyStartError({ code: "out_of_capacity", retryAfterSeconds: 120 }, NOW).kind).toBe("busy");
    expect(classifyStartError({ code: "billing_required", status: 402, error: "The included time is used" }, NOW).kind).toBe("unusable");
    expect(classifyStartError({ code: "trial_compute_limit_reached", status: 429 }, NOW).kind).toBe("unusable");
  });

  test("backoff grows to a minute and spreads threads apart", () => {
    expect(backoffMs(0, () => 0)).toBe(15_000);
    expect(backoffMs(1, () => 0)).toBe(30_000);
    expect(backoffMs(9, () => 0)).toBe(60_000);
    expect(backoffMs(0, () => 1)).toBe(18_000);
  });

  test("while two machines run it waits, says so once, and is ready when one frees", async () => {
    const boat = fakeBoat({ running: ["bx_a", "bx_b"], freeAfterSleeps: 3 });
    const notes: string[] = [];
    const result = await waitForCapacity(boat.cli, { max: 2, note: (line) => notes.push(line) });
    expect(result.state.kind).toBe("ready");
    expect(boat.sleeps()).toBe(3);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("waiting for a machine");
    expect(notes[0]).toContain("do not run on this PC");
  });

  test("not logged in or offline is unusable at once, with boat's own words", async () => {
    const boat = fakeBoat({ limitsFail: { status: 1, stdout: "", stderr: "error: not signed in. Run `boat login`.\n" } });
    const result = await waitForCapacity(boat.cli, { max: 2, note: () => {} });
    expect(result.state).toEqual({ kind: "unusable", why: "boat limits failed (exit 1): error: not signed in. Run `boat login`." });
    expect(boat.sleeps()).toBe(0);
  });
});

describe("runOnBoat", () => {
  const base = { push: "push-dir", command: ["bash", "-lc", "true"], timeoutSeconds: 600, what: "test", max: 2, note: () => {} };

  test("always passes --timeout, --no-env and --push, streams the command's lines, and reads id and cost", async () => {
    const boat = fakeBoat({ script: ["hello", "@@boat-step {}"] });
    const lines: string[] = [];
    const outcome = await runOnBoat(boat.cli, { ...base, registry: registry(), onLine: (line) => lines.push(line) });
    expect(outcome).toMatchObject({ kind: "ran", status: 0, facts: { id: "bx_mine1", costUsd: 0.0123, seconds: 95, deleted: true } });
    expect(lines).toEqual(["hello", "@@boat-step {}"]);
    const args = boat.calls[0]!;
    expect(args.slice(0, 2)).toEqual(["run", "--json"]);
    expect(args).toContain("--no-env");
    expect(args[args.indexOf("--timeout") + 1]).toBe("600");
    expect(args[args.indexOf("--push") + 1]).toBe("push-dir");
    expect(args.slice(args.indexOf("--") + 1)).toEqual(["bash", "-lc", "true"]);
  });

  test("a start refused because both machines are busy waits and starts again, never giving up to local", async () => {
    // The capacity check races another thread: it saw a free machine, the start was refused twice.
    const boat = fakeBoat({ refuseFirst: 2, script: ["done"] });
    const notes: string[] = [];
    const outcome = await runOnBoat(boat.cli, { ...base, registry: registry(), onLine: () => {}, note: (line) => notes.push(line) });
    expect(outcome.kind).toBe("ran");
    expect(boat.calls).toHaveLength(3);
    expect(boat.sleeps()).toBeGreaterThanOrEqual(2);
    expect(notes.some((line) => line.includes("Trial accounts can run 2 concurrent sandboxes."))).toBe(true);
  });

  test("the day's starts used up stops without a start; a refusal boat's limits explain as spent is spent", async () => {
    const day = { startWindowFull: { window: "day", freesAt: "2026-11-07T16:00:00Z" } };
    const spent = fakeBoat({ limits: day });
    const outcome = await runOnBoat(spent.cli, { ...base, registry: registry(), onLine: () => {} });
    expect(outcome).toMatchObject({ kind: "spent", until: Date.parse("2026-11-07T16:00:00Z") });
    expect(spent.calls).toHaveLength(0);

    // The window filled between the capacity check and the start; boat refused with a code this
    // module does not know. The limits read after the refusal decide, so it is not unusable.
    let limitsRead = 0;
    const raced = fakeBoat({});
    const plainLimits = raced.cli.limits;
    raced.cli.limits = async () => (limitsRead++ === 0 ? plainLimits() : ok(JSON.stringify({ activeSandboxes: 0, maxActiveSandboxes: 2, ...day })));
    raced.cli.run = async (args, onLine) => {
      raced.calls.push([...args]);
      onLine('{"code":"start_limit_reached","error":"You have used today\'s starts.","event":"error","status":429}');
      return { status: 1 };
    };
    expect(await runOnBoat(raced.cli, { ...base, registry: registry(), onLine: () => {} })).toMatchObject({ kind: "spent" });
    expect(raced.calls).toHaveLength(1);
  });

  test("the PC's boat lease is taken before machines are counted and released only after the machine is deleted", async () => {
    const boat = fakeBoat({});
    const order: string[] = [];
    const { limits, list, run, delete: remove, lease } = boat.cli;
    boat.cli.lease = async (what, note) => {
      order.push("lease");
      const held = await lease(what, note);
      return "release" in held ? { claim: (id: string) => (order.push("claim"), held.claim(id)), release: () => (order.push("release"), held.release()) } : held;
    };
    boat.cli.limits = async () => (order.push("limits"), limits());
    boat.cli.list = async () => (order.push("list"), list());
    boat.cli.delete = async (id) => (order.push("delete"), remove(id));
    boat.cli.run = async (args, onLine, onErr) => {
      order.push("run");
      // This boat forgets to delete its machine, so the run deletes it before letting go.
      const result = await run(args, (line) => onLine(line.includes('"event":"summary"') ? line.replace('"deleted":true', '"deleted":false') : line), onErr);
      return result;
    };
    boat.cli.list = async () => (order.push("list"), ok(listOf(["bx_mine1"])));
    await runOnBoat(boat.cli, { ...base, what: "verify:fast beta abc", registry: registry(), onLine: () => {} });
    expect(order[0]).toBe("lease");
    expect(order.indexOf("list")).toBeGreaterThan(0);
    expect(order.indexOf("delete")).toBeGreaterThan(order.indexOf("run"));
    // Let go only after the machine was deleted.
    expect(order.at(-1)).toBe("release");
    expect(order.lastIndexOf("delete")).toBeLessThan(order.indexOf("release"));
    // The machine is named to fairshare as soon as boat reports it, while the run goes on.
    expect(order.indexOf("claim")).toBeGreaterThan(order.indexOf("run"));
    expect(order.indexOf("claim")).toBeLessThan(order.indexOf("delete"));
    expect(boat.leases).toHaveLength(3);
    expect(boat.leases[0]).toBe("take verify:fast beta abc");
    expect(boat.leases[1]).toMatch(/^claim bx_\w+$/);
    expect(boat.leases[2]).toBe("release");
  });

  test("without fairshare to hold the cap boat is unusable for this run, and nothing starts", async () => {
    const boat = fakeBoat({});
    boat.cli.lease = async () => ({ unusable: "fairshare is not installed" });
    expect(await runOnBoat(boat.cli, { ...base, registry: registry(), onLine: () => {} })).toMatchObject({ kind: "unusable", why: "fairshare is not installed" });
    expect(boat.calls).toHaveLength(0);
  });

  test("the lease is released when the run throws", async () => {
    const boat = fakeBoat({});
    boat.cli.run = async () => {
      throw new Error("boat crashed");
    };
    await expect(runOnBoat(boat.cli, { ...base, registry: registry(), onLine: () => {} })).rejects.toThrow("boat crashed");
    expect(boat.leases.at(-1)).toBe("release");
  });

  test("the command's exit code comes back as it is", async () => {
    const boat = fakeBoat({ status: 1 });
    expect(await runOnBoat(boat.cli, { ...base, registry: registry(), onLine: () => {} })).toMatchObject({ kind: "ran", status: 1 });
  });

  test("a machine boat did not delete is deleted, and the registry ends empty", async () => {
    const path = registry();
    const boat = fakeBoat({});
    // This boat forgets to delete its machine and never reports a summary.
    boat.cli.run = async (_args, onLine) => {
      onLine(JSON.stringify({ event: "created", id: "bx_left" }));
      return { status: 130 };
    };
    boat.cli.list = async () => ok(listOf(["bx_left"]));
    await runOnBoat(boat.cli, { ...base, registry: path, onLine: () => {} });
    expect(boat.deleted).toEqual(["bx_left"]);
    expect(readRegistry(path)).toEqual([]);
  });

  test("a machine whose owner died is deleted by the next run; a live owner's and unlisted machines are left alone", async () => {
    const path = registry();
    updateRegistry(path, () => [
      { id: "bx_dead", pid: 999_999, startedAt: NOW, what: "a killed run" },
      { id: "bx_live", pid: 4242, startedAt: NOW, what: "a running lane" },
    ]);
    const boat = fakeBoat({});
    const reaped = await reapOrphans(boat.cli, path, (pid) => pid === 4242);
    expect(reaped).toEqual(["bx_dead"]);
    expect(boat.deleted).toEqual(["bx_dead"]);
    expect(readRegistry(path).map((entry) => entry.id)).toEqual(["bx_live"]);
  });
});

describe("boat's output", () => {
  test("a long line cut across output chunks comes back whole", () => {
    const lines: string[] = [];
    const join = lineJoiner((line) => lines.push(line));
    join.push("@@boat-step {\"name\":");
    join.push("\"a\"}\nsecond");
    join.push(" line\n");
    join.push("tail");
    join.end();
    expect(lines).toEqual(['@@boat-step {"name":"a"}', "second line", "tail"]);
  });

  test("boat's events are told apart from the command's own JSON", () => {
    expect(boatEvent('{"event":"created","id":"bx_1"}')).not.toBeNull();
    expect(boatEvent('{"type":"stdout","data":"x"}')).not.toBeNull();
    expect(boatEvent('{"name":"a","ok":true}')).toBeNull();
    expect(boatEvent("plain words")).toBeNull();
  });
});
