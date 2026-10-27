import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { provisionCapturedGame } from "./provisionCapture";

const fixture = join(import.meta.dir, "../.scratch/provision-capture-fixture");

describe("provisionCapturedGame", () => {
  test("a folder that is not a game (no src/ and package.json) pulls nothing", async () => {
    mkdirSync(fixture, { recursive: true });
    const lines: string[] = [];
    await provisionCapturedGame(fixture, (line) => lines.push(line));
    expect(lines).toEqual([]);
  });

  test("JG_DEV_PROVISION=0 skips provisioning for offline work", async () => {
    const before = process.env["JG_DEV_PROVISION"];
    process.env["JG_DEV_PROVISION"] = "0";
    const lines: string[] = [];
    await provisionCapturedGame(join(import.meta.dir, "../games/hold-the-line"), (line) => lines.push(line));
    if (before === undefined) delete process.env["JG_DEV_PROVISION"];
    else process.env["JG_DEV_PROVISION"] = before;
    expect(lines).toEqual([]);
  });
});
