import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import {
  QUICK_DRIVE_WINDOW_MS,
  QUICK_HEIGHT,
  QUICK_WIDTH,
  quickMisuse,
  quickProfile,
  quickSuffix,
  quickTimingLine,
  splitQuickFlag,
} from "./capture-preset";

describe("--quick is one preset, parsed by both scripts", () => {
  test("splitQuickFlag strips the flag and leaves the rest of argv alone", () => {
    expect(splitQuickFlag("shoot", ["demo", "--quick", "--mode", "play"])).toEqual({
      quick: true,
      argv: ["demo", "--mode", "play"],
    });
    expect(splitQuickFlag("drive", ["demo", "--click", "START"])).toEqual({
      quick: false,
      argv: ["demo", "--click", "START"],
    });
  });

  test("the preset is 960x540, a 2s drive window, and its own file suffix", () => {
    expect(QUICK_WIDTH).toBe(960);
    expect(QUICK_HEIGHT).toBe(540);
    expect(QUICK_DRIVE_WINDOW_MS).toBe(2_000);
    expect(quickProfile(true)).toEqual({ width: 960, height: 540 });
    expect(quickProfile(false)).toEqual({});
    expect(quickSuffix(true)).toBe("-quick");
    expect(quickSuffix(false)).toBe("");
  });

  test("the printed line carries the wall time and the claims it cannot support", () => {
    const line = quickTimingLine("shoot", { seconds: 4.321, width: 960, height: 540, tier: "low", phases: ["ready=1.00s", "frame(screencast)=0.20s"] });
    expect(line).toContain("quick 960x540 tier low ready=1.00s frame(screencast)=0.20s");
    expect(line).toContain("total=4.32s");
    expect(line).toContain("no 1600x900 pixel claim");
    expect(line).toContain("no frame-time claim");
    expect(quickTimingLine("drive", { seconds: 2, width: 960, height: 540, device: "mobile" })).toContain("quick mobile 960x540 tier n/a");
  });
});

describe("a quick run refuses what it cannot prove", () => {
  test("a plain quick request is allowed, and nothing is refused without --quick", () => {
    expect(quickMisuse({ tool: "shoot", quick: true, width: 960, height: 540, device: "desktop" })).toBeNull();
    expect(quickMisuse({ tool: "drive", quick: true })).toBeNull();
    expect(quickMisuse({ tool: "drive", quick: false, playtest: true, record: "clip", width: 1600 })).toBeNull();
  });

  test("a 1600x900 claim names --quick and the size flags", () => {
    const message = quickMisuse({ tool: "shoot", quick: true, width: 1600, height: 900 });
    expect(message).toContain("--quick");
    expect(message).toContain("--width 1600");
    expect(message).toContain("--height 900");
    expect(quickMisuse({ tool: "shoot", quick: true, height: 1200 })).toContain("--height 1200");
  });

  test("--size, a phone device and a perf pass are refused by name", () => {
    expect(quickMisuse({ tool: "shoot", quick: true, size: "full" })).toContain("--size full");
    expect(quickMisuse({ tool: "shoot", quick: true, device: "both" })).toContain("--device both");
    const perf = quickMisuse({ tool: "drive", quick: true, playtest: true });
    expect(perf).toContain("--quick");
    expect(perf).toContain("--playtest");
    expect(perf).toContain("perf number");
  });

  test("video is refused, naming every recording flag asked for", () => {
    const message = quickMisuse({ tool: "drive", quick: true, record: "clip", recordFps: 24 });
    expect(message).toContain("--quick");
    expect(message).toContain("--record and --record-fps");
    expect(quickMisuse({ tool: "drive", quick: true, recordRealtime: true })).toContain("--record-realtime");
  });
});

describe("the CLIs fail on the flag, before any browser starts", () => {
  const scripts = import.meta.dir;
  const run = (script: string, args: string[]) =>
    spawnSync(process.execPath, [join(scripts, script), ...args], { encoding: "utf8", timeout: 60_000 });

  test("shoot --quick --width 1600 --height 900", () => {
    const result = run("shoot-dev.ts", ["demo", "--quick", "--width", "1600", "--height", "900"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--quick");
    expect(result.stderr).toContain("--width 1600");
    expect(result.stderr).toContain("--height 900");
  });

  test("drive --quick --playtest", () => {
    const result = run("drive-dev.ts", ["demo", "--quick", "--playtest"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--quick");
    expect(result.stderr).toContain("--playtest");
  });

  test("drive --quick --record clip", () => {
    const result = run("drive-dev.ts", ["demo", "--quick", "--record", "clip"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--record");
  });

  test("both help screens document the preset", () => {
    for (const script of ["shoot-dev.ts", "drive-dev.ts"]) {
      const result = run(script, ["demo", "--quick", "--help"]);
      expect({ script, status: result.status }).toEqual({ script, status: 0 });
      expect(result.stdout).toContain("--quick");
      expect(result.stdout).toContain("960x540");
    }
  });
});
