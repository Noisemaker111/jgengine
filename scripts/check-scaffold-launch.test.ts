import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CAPTURE_SCRIPTS, auditCaptureScripts, scanForFetchEverywhere, scanForSecondLauncher } from "./check-scaffold-launch";

/**
 * The gate that stops a fourth copy of the proxy-broken probe: any fetch() in runtime source
 * fails unless the file is on the printed remote-only list. This proves the scan finds a new
 * one, names it, skips tests, and honours a waiver.
 */

function tree(files: Record<string, string>): string {
  // fixture-location: allow the scan only reads the file names and one fetch( line, so no engine import is needed
  const root = mkdtempSync(join(tmpdir(), "jg-fetch-scan-"));
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

describe("the repo-wide localhost fetch scan", () => {
  test("finds a fetch in scripts and in a package source, with its line", async () => {
    const root = tree({
      "scripts/new-probe.ts": "const a = 1;\nconst b = await fetch(`http://127.0.0.1:9222/json/version`);\n",
      "packages/core/src/probe.ts": "export const url = () => fetch(\"http://localhost:5173\");\n",
    });
    const found = await scanForFetchEverywhere(root);
    expect(found).toEqual(["scripts/new-probe.ts:2", "packages/core/src/probe.ts:1"]);
  });

  test("skips tests, and honours a remote-only waiver", async () => {
    const root = tree({
      "scripts/probe.test.ts": "await fetch(\"http://127.0.0.1:1\");\n",
      "scripts/mirror-assets.ts": "await fetch(`https://api.github.com${path}`);\n",
      "scripts/clean.ts": "export const ok = 1;\n",
    });
    expect(await scanForFetchEverywhere(root)).toEqual([]);
  });

  test("this repository is clean today", async () => {
    expect(await scanForFetchEverywhere()).toEqual([]);
  });
});

describe("one Chrome launch path", () => {
  test("a script that spawns its own browser is named, and the two launch owners are not", async () => {
    const root = tree({
      "scripts/browser-lib.ts": "spawn(chrome, [`--remote-debugging-port=${port}`]);\n",
      "packages/jgengine/src/templates/gameFiles.ts": "const browser = `--remote-debugging-port=${port}`;\n",
      "scripts/quick-shot.ts": "spawn(chrome, [\"--headless=new\", `--remote-debugging-port=${port}`]);\n",
    });
    expect(await scanForSecondLauncher(root)).toEqual(["scripts/quick-shot.ts:1"]);
  });

  test("a capture script with its own launch or wait is reported, a shared one is not", () => {
    const shared = 'import { startBrowser } from "./browser-lib";\nawait startBrowser({ debugPort });\n';
    const own = 'import { spawn } from "node:child_process";\nawait startBrowser;\n';
    const every = (shoot: string): Record<string, string> =>
      Object.fromEntries(CAPTURE_SCRIPTS.map((script) => [script, script === "scripts/shoot-dev.ts" ? shoot : shared]));
    expect(auditCaptureScripts(every(shared))).toEqual({ missingImport: [], ownWait: [] });
    expect(auditCaptureScripts(every(own)).missingImport).toEqual(["scripts/shoot-dev.ts"]);
    expect(auditCaptureScripts(every(`${shared}async function waitForDebugger(port) {}\n`)).ownWait).toEqual([
      "scripts/shoot-dev.ts",
    ]);
  });

  test("this repository launches Chrome in exactly two files", async () => {
    expect(await scanForSecondLauncher()).toEqual([]);
    const sources = Object.fromEntries(
      await Promise.all(CAPTURE_SCRIPTS.map(async (script) => [script, await Bun.file(script).text()])),
    );
    expect(auditCaptureScripts(sources)).toEqual({ missingImport: [], ownWait: [] });
  });
});
