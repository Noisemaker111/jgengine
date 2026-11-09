import { spawnSync } from "node:child_process";

import { describe, expect, test } from "bun:test";

import { priorityLabel } from "./machine-priority";

const moduleUrl = new URL("./machine-priority.ts", import.meta.url).href;

/** Run `code` in its own bun, so lowering a priority never slows the rest of this test run. */
function inChild(code: string): string {
  const run = spawnSync(process.execPath, ["-e", code], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
  if (run.status !== 0) throw new Error(`child exited ${run.status}: ${run.stderr}`);
  return run.stdout.trim();
}

describe("machine priority", () => {
  test("labels follow Node's cross-platform scale", () => {
    expect(priorityLabel(19)).toBe("low");
    expect(priorityLabel(10)).toBe("below-normal");
    expect(priorityLabel(0)).toBe("normal");
    expect(priorityLabel(-7)).toBe("above-normal");
    expect(priorityLabel(-14)).toBe("high");
    expect(priorityLabel(-20)).toBe("realtime");
  });

  test("stayOutOfTheWay drops the process to below-normal and a child it spawns inherits that", () => {
    const out = inChild(`
      const { stayOutOfTheWay, currentPriority } = await import(${JSON.stringify(moduleUrl)});
      const { spawnSync } = await import("node:child_process");
      const mine = stayOutOfTheWay();
      const child = spawnSync(process.execPath, ["-e", "console.log(require('node:os').getPriority())"], { encoding: "utf8", windowsHide: true });
      console.log(JSON.stringify({ mine, again: stayOutOfTheWay(), child: Number(child.stdout.trim()), label: currentPriority() }));
    `);
    const result = JSON.parse(out) as { mine: string; again: string; child: number; label: string };
    expect(result.mine).toBe("below-normal");
    // Already lower than normal: a second call keeps it, never raises it.
    expect(result.again).toBe("below-normal");
    expect(result.label).toBe("below-normal");
    expect(priorityLabel(result.child)).toBe("below-normal");
    // Below-normal children on a saturated PC can wait seconds for a slice; what is checked is the label.
  }, 30_000);

  test.if(process.platform === "win32")("restoreNormalPriority puts a measured child back to normal while the launcher stays below", () => {
    const out = inChild(`
      const { stayOutOfTheWay, restoreNormalPriority, currentPriority } = await import(${JSON.stringify(moduleUrl)});
      const { spawn } = await import("node:child_process");
      const os = await import("node:os");
      stayOutOfTheWay();
      const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 20000)"], { stdio: "ignore", windowsHide: true });
      const inherited = currentPriority(child.pid);
      const restored = restoreNormalPriority(child.pid);
      const read = os.getPriority(child.pid);
      child.kill();
      console.log(JSON.stringify({ inherited, restored, read, launcher: currentPriority() }));
    `);
    const result = JSON.parse(out) as { inherited: string; restored: string; read: number; launcher: string };
    expect(result.inherited).toBe("below-normal");
    expect(result.restored).toBe("normal");
    expect(result.read).toBe(0);
    expect(result.launcher).toBe("below-normal");
  }, 30_000);

  test.if(process.platform === "win32")("lowerToBelowNormal puts a process started at normal below normal", () => {
    // The shoot daemon's Chrome is created by WMI and inherits nothing, so it is lowered by pid.
    const out = inChild(`
      const { lowerToBelowNormal, restoreNormalPriority } = await import(${JSON.stringify(moduleUrl)});
      const { spawn } = await import("node:child_process");
      const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 20000)"], { stdio: "ignore", windowsHide: true });
      // This run may itself be below normal (Owl lowers agent sessions), so the child starts at normal on purpose.
      const before = restoreNormalPriority(child.pid);
      const after = lowerToBelowNormal(child.pid);
      child.kill();
      console.log(JSON.stringify({ before, after }));
    `);
    expect(JSON.parse(out)).toEqual({ before: "normal", after: "below-normal" });
  }, 30_000);
});
