/**
 * A synchronous child-process call blocks the test runner's event loop, so Bun's per-test timeout
 * cannot fire while it waits. One stuck child (a Bun 1.3.8 module-load stall in an assets CLI test)
 * hung the CI `test` job for 13 minutes until GitHub cancelled it. Every sync spawn in a test file
 * must therefore carry its own `timeout`, so a stuck child fails that test with ETIMEDOUT instead.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SYNC_SPAWN = /\b(spawnSync|execFileSync|execSync|Bun\.spawnSync)\(/g;
const ROOTS = ["packages", "scripts", "apps"];

/** Text of the call's arguments: from the opening paren to its balanced close, skipping string contents. */
function callArguments(source: string, open: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index]!;
    if (quote !== null) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "(") depth += 1;
    else if (char === ")" && --depth === 0) return source.slice(open, index + 1);
  }
  return source.slice(open);
}

/** 1-based line numbers of sync child-process calls whose arguments never mention `timeout`. */
export function findUntimedSyncSpawns(source: string): number[] {
  const lines: number[] = [];
  for (const match of source.matchAll(SYNC_SPAWN)) {
    const open = match.index + match[0].length - 1;
    if (/\btimeout\b/.test(callArguments(source, open))) continue;
    lines.push(source.slice(0, match.index).split("\n").length);
  }
  return lines;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    // This checker's own test holds untimed calls as fixture text.
    else if (/\.test\.tsx?$/.test(entry) && entry !== "check-test-spawn-timeouts.test.ts") out.push(path);
  }
  return out;
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const failures: string[] = [];
  for (const dir of ROOTS) {
    for (const file of walk(join(root, dir))) {
      for (const line of findUntimedSyncSpawns(readFileSync(file, "utf8"))) failures.push(`${relative(root, file)}:${line}`);
    }
  }
  if (failures.length > 0) {
    console.error("check-test-spawn-timeouts: sync child-process calls in tests without a timeout\n");
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      "\nA sync spawn blocks the event loop, so the test timeout cannot stop a stuck child and the whole CI job hangs." +
        "\nPass `timeout` (ms) in the call's options and assert on the result, or use async Bun.spawn.",
    );
    process.exit(1);
  }
  console.log("check-test-spawn-timeouts: ok");
}
