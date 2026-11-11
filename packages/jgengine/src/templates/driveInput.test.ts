import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

import { materializeHarness } from "../harness";
import { driveInputPointExpr, parseDriveFill } from "./driveInput";

describe("drive form arguments", () => {
  test("native control clicks use Rune bounds without querying DOM or computed styles", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "__jgNativeUi");
    Object.defineProperty(globalThis, "__jgNativeUi", { configurable: true, value: { point: (label: string) => label === "settings" ? { x: 25, y: 50 } : null } });
    try {
      expect((0, eval)(driveInputPointExpr("Settings"))).toEqual({ x: 25, y: 50 });
      expect((0, eval)(driveInputPointExpr("Missing"))).toBeNull();
    } finally {
      if (original === undefined) Reflect.deleteProperty(globalThis, "__jgNativeUi");
      else Object.defineProperty(globalThis, "__jgNativeUi", original);
    }
  });

  test("splits at the first equals sign and preserves empty values and whitespace", () => {
    expect(parseDriveFill("Scene name=Course = dusk")).toEqual({ label: "Scene name", value: "Course = dusk" });
    expect(parseDriveFill("Description=")).toEqual({ label: "Description", value: "" });
    expect(parseDriveFill("Scene name=  Course  ").value).toBe("  Course  ");
  });

  test("both command parsers reject missing labels and malformed steps before browser startup", () => {
    const dir = materializeHarness("drive");
    try {
      for (const script of [resolve(import.meta.dir, "../../../../scripts/drive-dev.ts"), resolve(dir, "drive.mjs")]) {
        for (const args of [["--fill"], ["--fill", "Scene name"], ["--fill", "=Course"], ["--fill", " =Course"], ["--fill", "--click=Course"], ["--double-click"], ["--double-click", "--wait"]]) {
          const result = spawnSync(process.execPath, [script, ...args, "--help"], { encoding: "utf8", timeout: 5_000 });
          expect(result.status).toBe(1);
          expect(result.stderr).toMatch(/--fill expects|requires a value/);
          expect(result.stderr).not.toContain("starting");
        }
        const help = spawnSync(process.execPath, [script, "--fill", "Scene name=Course=dusk", "--double-click", "Rock", "--help"], { encoding: "utf8", timeout: 5_000 });
        expect(help.status).toBe(0);
        expect(help.stdout).toContain("--fill");
        expect(help.stdout).toContain("--double-click");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
