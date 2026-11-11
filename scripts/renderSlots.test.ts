import { afterEach, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { launchChrome } from "./browser-lib";
import { renderSlotCount, renderSlotHolders, slotsSkipped, takeRenderSlot } from "./renderSlots";

const root = join(import.meta.dir, "..", ".scratch");
const dirs: string[] = [];
let made = 0;
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function slotEnv(slots: number, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const dir = join(root, `render-slots-${process.pid}-${(made += 1)}`);
  mkdirSync(dir, { recursive: true });
  dirs.push(dir);
  // FAIRSHARE_EXE empty: the count alone decides, wherever the test runs.
  return { JG_RENDER_DIR: dir, JG_RENDER_SLOTS: String(slots), FAIRSHARE_EXE: "", JG_RENDER_SLOTS_IN_TESTS: "1", ...extra };
}

describe("render slots", () => {
  test("a test's browser and what a test spawns take no slot unless the test asks; a drive does", () => {
    const inTest: NodeJS.ProcessEnv = {};
    expect(slotsSkipped(inTest, "/w/packages/core/src/hud/hudFade.view.test.ts")).toBe(true);
    expect(inTest["JG_RENDER_UNDER_TEST"]).toBe("1");
    expect(slotsSkipped({ JG_RENDER_UNDER_TEST: "1" }, "/w/scripts/drive-dev.ts")).toBe(true);
    expect(slotsSkipped({}, "/w/scripts/drive-dev.ts")).toBe(false);
    expect(slotsSkipped({ JG_RENDER_SLOTS_IN_TESTS: "1" }, "/w/scripts/renderSlots.test.ts")).toBe(false);
  });

  test("sized to the machine: one per four threads and four GB, at least one; JG_RENDER_SLOTS wins", () => {
    expect(renderSlotCount({}, 8, 16 * 2 ** 30)).toBe(2);
    expect(renderSlotCount({}, 24, 32 * 2 ** 30)).toBe(6);
    expect(renderSlotCount({}, 24, 8 * 2 ** 30)).toBe(2);
    expect(renderSlotCount({}, 2, 4 * 2 ** 30)).toBe(1);
    expect(renderSlotCount({ JG_RENDER_SLOTS: "3" }, 8, 16 * 2 ** 30)).toBe(3);
  });

  test("six runs started at once never render more than the machine's slots", async () => {
    const env = slotEnv(2);
    const log = join(env["JG_RENDER_DIR"]!, "events.log");
    // Each child takes a slot the way a launch does, logs while it holds it, then lets it go.
    const child = `
      import { appendFileSync } from "node:fs";
      import { takeRenderSlot } from ${JSON.stringify(join(import.meta.dir, "renderSlots.ts"))};
      const slot = takeRenderSlot({ label: "child " + process.pid, log: () => {} });
      appendFileSync(${JSON.stringify(log)}, "+\\n");
      await Bun.sleep(700);
      appendFileSync(${JSON.stringify(log)}, "-\\n");
      slot.release();
    `;
    const script = join(env["JG_RENDER_DIR"]!, "child.ts");
    writeFileSync(script, child);
    const runs = Array.from({ length: 6 }, () => spawn(process.execPath, [script], { env: { ...process.env, ...env }, stdio: "ignore" }));
    const codes = await Promise.all(runs.map((run) => new Promise<number | null>((resolve) => run.once("exit", resolve))));
    expect(codes).toEqual([0, 0, 0, 0, 0, 0]);
    let open = 0;
    let most = 0;
    for (const event of readFileSync(log, "utf8").split("\n").filter(Boolean)) {
      open += event === "+" ? 1 : -1;
      most = Math.max(most, open);
    }
    expect(most).toBe(2);
    expect(renderSlotHolders(env)).toEqual([]);
  }, 30_000);

  test("a slot whose run and browser are gone is taken back; a held one is waited on until the wait runs out", () => {
    const env = slotEnv(1, { JG_RENDER_WAIT_MINUTES: "0.001" });
    const dead = 2 ** 22 + 12345;
    writeFileSync(join(env["JG_RENDER_DIR"]!, "slot-0.json"), JSON.stringify({ token: "old", label: "killed run", pid: dead, browserPid: dead, takenAt: "" }));
    const alive = (pid: number): boolean => pid !== dead;
    const taken = takeRenderSlot({ label: "next", env, alive, log: () => {} });
    expect(taken.index).toBe(0);
    const lines: string[] = [];
    expect(() => takeRenderSlot({ label: "another run", env, alive, pid: 999_999, log: (line) => lines.push(line) })).toThrow(/all 1 held .* by next/);
    expect(lines[0]).toContain("waiting for one of 1 (held by next");
    taken.release();
    expect(takeRenderSlot({ label: "after", env, alive, pid: 999_999, log: () => {} }).index).toBe(0);
  });

  test("a slot outlives its launcher while the browser it names still runs", () => {
    const env = slotEnv(1, { JG_RENDER_WAIT_MINUTES: "0.001" });
    const launcher = 4_000_001;
    const browser = 4_000_002;
    let launcherAlive = true;
    const alive = (pid: number): boolean => pid === browser || (pid === launcher && launcherAlive);
    takeRenderSlot({ label: "daemon", env, alive, pid: launcher, log: () => {} }).attach(browser);
    launcherAlive = false;
    expect(() => takeRenderSlot({ label: "other", env, alive, pid: 4_000_003, log: () => {} })).toThrow(/held .* browser 4000002/);
  });

  test("a run holding a slot gets one more for a second browser of its own, never a third past the count", () => {
    const env = slotEnv(1, { JG_RENDER_WAIT_MINUTES: "0.001" });
    const first = takeRenderSlot({ label: "a", env, log: () => {} });
    const second = takeRenderSlot({ label: "b", env, log: () => {} });
    expect([first.index, second.index]).toEqual([0, 1]);
    expect(() => takeRenderSlot({ label: "someone else", env, pid: 999_998, alive: (pid) => pid === process.pid, log: () => {} })).toThrow(/all 1 held/);
  });

  test("fairshare saying there is no room holds back a second browser, never the first", () => {
    const env = slotEnv(2, { JG_RENDER_WAIT_MINUTES: "0.001" });
    const first = takeRenderSlot({ label: "first", env, room: () => false, log: () => {} });
    expect(first.index).toBe(0);
    expect(() => takeRenderSlot({ label: "second", env, pid: 999_997, alive: (pid) => pid === process.pid, room: () => false, log: () => {} })).toThrow(/held/);
    expect(takeRenderSlot({ label: "second", env, pid: 999_997, alive: (pid) => pid === process.pid, room: () => true, log: () => {} }).index).toBe(1);
  });

  test("the one browser launch every capture path calls waits for a slot instead of starting Chrome", () => {
    const env = slotEnv(1, { JG_RENDER_WAIT_MINUTES: "0.001" });
    const saved = { ...process.env };
    Object.assign(process.env, env);
    // Held by a live process that is not this one, so this launch has no slot and no overflow.
    writeFileSync(join(env["JG_RENDER_DIR"]!, "slot-0.json"), JSON.stringify({ token: "x", label: "another drive", pid: process.ppid, takenAt: "" }));
    try {
      expect(() => launchChrome(0, "jg-render-slot-test-")).toThrow(/render slots: all 1 held .* by another drive/);
    } finally {
      for (const key of Object.keys(env)) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
  });
});
