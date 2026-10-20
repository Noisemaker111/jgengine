import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { materializeHarness } from "../harness";
import { CAPTURE_FLAGS, parseCaptureArgs, type CaptureFlag, type CaptureTool } from "./captureArgs";

/** A valid value for each flag, so every flag can be exercised by every host. */
export function sampleArgv(entry: CaptureFlag): string[] {
  const samples: Record<string, string> = {
    "--click": "Start", "--double-click": "Tile", "--click-at": "10,20", "--right-click-at": "30,40",
    "--fill": "Name=Ada", "--key": "KeyW+KeyD:250", "--wait": "100", "--shot": "after",
    "--rpc": '{"method":"debug_snapshot"}', "--probe": "p0", "--url": "http://127.0.0.1:5173/", "--port": "5199",
    "--device": "mobile", "--width": "800", "--height": "600", "--size": "half", "--quality": "draft", "--settle": "500", "--timeout": "90",
    "--param": "gamepad=2", "--out": "/tmp/x.png", "--seed": "3", "--sample": "200", "--softlock": "1500",
    "--epsilon": "0.01", "--game": "demo", "--mode": "play", "--state": "two-towers", "--run": "game.start",
    "--view": "hero", "--look": "1,2", "--look-from": "12,5", "--spawn": "1,0,1", "--style": "toon",
    "--preview": "hud", "--fixture": "bars", "--site": "/play", "--connect": "9223", "--record": "clip",
    "--record-fps": "12", "--record-width": "480",
  };
  if (entry.value === "none") return [entry.flag];
  const value = samples[entry.flag];
  if (value === undefined) throw new Error(`no sample value for ${entry.flag}; add one`);
  return [entry.flag, value];
}

const tools: CaptureTool[] = ["shoot", "drive"];

describe("parseCaptureArgs", () => {
  test("parses every flag of each tool and refuses unknown and other-tool flags", () => {
    for (const tool of tools) {
      for (const entry of CAPTURE_FLAGS.filter((flag) => flag.tools.includes(tool))) {
        expect(() => parseCaptureArgs(tool, sampleArgv(entry), CAPTURE_FLAGS)).not.toThrow();
      }
      expect(() => parseCaptureArgs(tool, ["--clik", "x"], CAPTURE_FLAGS)).toThrow("unknown option --clik");
    }
    expect(() => parseCaptureArgs("shoot", ["--click", "Start"], CAPTURE_FLAGS)).toThrow("drive option");
  });

  test("keeps steps ordered and defaults debug_snapshot to the summary", () => {
    const parsed = parseCaptureArgs("drive", ["demo", "--click-at", "10,20", "--key", "mouse0:1200", "--rpc", '{"method":"debug_snapshot"}', "--shot", "/tmp/a.png"], CAPTURE_FLAGS);
    expect(parsed.positionals).toEqual(["demo"]);
    expect(parsed.steps).toEqual([
      { kind: "click-at", spec: "10,20", button: "left" },
      { kind: "key", code: "mouse0", holdMs: 1200 },
      { kind: "rpc", json: '{"method":"debug_snapshot","detail":"summary"}', summarized: true },
      { kind: "shot", name: "/tmp/a.png", out: "/tmp/a.png" },
    ]);
    expect(parseCaptureArgs("drive", ["--rpc", '{"method":"debug_snapshot","detail":"full"}'], CAPTURE_FLAGS).steps[0]).toMatchObject({ summarized: false });
    expect(() => parseCaptureArgs("drive", ["--shot", "shots/a.png"], CAPTURE_FLAGS)).toThrow("not a relative path");
    expect(() => parseCaptureArgs("shoot", ["--port", "--width"], CAPTURE_FLAGS)).toThrow("--port requires a value");
  });
});

describe("portable harness parity", () => {
  test("the embedded browser.mjs parser is the same function and agrees on every flag", async () => {
    const dir = materializeHarness("drive");
    try {
      const portable = await import(pathToFileURL(join(dir, "browser.mjs")).href);
      expect(portable.CAPTURE_FLAGS).toEqual(JSON.parse(JSON.stringify(CAPTURE_FLAGS)));
      for (const tool of tools) {
        for (const entry of CAPTURE_FLAGS.filter((flag) => flag.tools.includes(tool))) {
          const argv = sampleArgv(entry);
          expect(portable.parseCaptureArgs(tool, argv, portable.CAPTURE_FLAGS)).toEqual(parseCaptureArgs(tool, argv, CAPTURE_FLAGS));
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("drive.mjs and shoot.mjs accept every portable flag and name each engine-only one", () => {
    for (const tool of tools) {
      const dir = materializeHarness(tool);
      try {
        for (const entry of CAPTURE_FLAGS.filter((flag) => flag.tools.includes(tool))) {
          const run = spawnSync(process.execPath, [join(dir, `${tool}.mjs`), ...sampleArgv(entry), "--help"], { encoding: "utf8", timeout: 30_000 });
          expect({ flag: entry.flag, status: run.status }).toEqual({ flag: entry.flag, status: 0 });
          if (entry.engineOnly === undefined) continue;
          const refused = spawnSync(process.execPath, [join(dir, `${tool}.mjs`), ...sampleArgv(entry)], { encoding: "utf8", timeout: 30_000 });
          expect(refused.status).toBe(1);
          expect(refused.stderr).toContain(`${entry.flag} ${entry.engineOnly}`);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  }, 60_000);
});
