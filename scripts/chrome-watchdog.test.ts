import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, test } from "bun:test";

import { alive, watch } from "./chrome-watchdog";

const dir = join(tmpdir(), `jg-chrome-watchdog-${process.pid}`);
mkdirSync(dir, { recursive: true });
const started: ChildProcess[] = [];
afterAll(() => {
  for (const child of started) {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
  rmSync(dir, { recursive: true, force: true });
});

/** A process that lives until killed, standing in for a launcher or a Chrome. */
function longLived(): ChildProcess {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 120000)"], { stdio: "ignore", windowsHide: true });
  started.push(child);
  return child;
}

async function until(check: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (!check() && Date.now() < deadline) await Bun.sleep(100);
  return check();
}

describe("chrome watchdog", () => {
  test("leaves quietly when Chrome exits on its own, killing nothing", async () => {
    const alive = new Set([1, 2]);
    const killed: number[] = [];
    const run = watch(1, 2, dir, { pollMs: 10, isAlive: (pid) => alive.has(pid), kill: (pid) => (killed.push(pid), true), remove: () => {} });
    await Bun.sleep(30);
    alive.delete(2);
    expect(await run).toEqual({ reason: "chrome exited", chromeEnded: true });
    expect(killed).toEqual([]);
  });

  test("ends Chrome's tree and its profile when the launcher dies first", async () => {
    const alive = new Set([1, 2]);
    const killed: number[] = [];
    const removed: string[] = [];
    const run = watch(1, 2, dir, { pollMs: 10, isAlive: (pid) => alive.has(pid), kill: (pid) => (killed.push(pid), true), remove: (path) => void removed.push(path) });
    await Bun.sleep(30);
    alive.delete(1);
    expect(await run).toEqual({ reason: "launcher died", chromeEnded: true });
    expect(killed).toEqual([2]);
    expect(removed).toEqual([dir]);
  });

  test("a profile is kept when the kill was refused, so a later sweep can retry", async () => {
    const removed: string[] = [];
    const outcome = await watch(1, 2, dir, { pollMs: 10, isAlive: (pid) => pid === 2, kill: () => false, remove: (path) => void removed.push(path) });
    expect(outcome).toEqual({ reason: "launcher died", chromeEnded: false });
    expect(removed).toEqual([]);
  });

  test("the real watchdog kills a 'Chrome' within seconds of its launcher being force-killed", async () => {
    // The launcher is killed the way a thread's end or `taskkill /F` kills it: no exit handler runs.
    const launcher = longLived();
    const chrome = longLived();
    const profile = join(dir, "jg-drive-fake");
    mkdirSync(profile, { recursive: true });
    writeFileSync(join(profile, "jg-owner-run"), String(launcher.pid));
    const watchdog = spawn(process.execPath, [join(import.meta.dir, "chrome-watchdog.ts"), String(launcher.pid), String(chrome.pid), profile], {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    started.push(watchdog);
    let stderr = "";
    watchdog.stderr?.on("data", (chunk) => (stderr += String(chunk)));
    const exit = new Promise<number | null>((resolve) => watchdog.on("exit", (code) => resolve(code)));
    await Bun.sleep(300);
    expect(alive(chrome.pid!)).toBe(true);
    launcher.kill("SIGKILL");
    expect(await until(() => !alive(chrome.pid!), 10_000), `chrome ${chrome.pid} still alive; watchdog said: ${stderr}`).toBe(true);
    expect(await exit).toBe(0);
    expect(existsSync(profile)).toBe(false);
  }, 30_000);
});
