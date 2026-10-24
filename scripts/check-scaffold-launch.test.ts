import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { scanForFetchEverywhere } from "./check-scaffold-launch";

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
