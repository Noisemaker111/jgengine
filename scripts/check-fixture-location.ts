/**
 * A test that builds its fixture in `%TEMP%` sits outside the workspace, where `@jgengine/*` no
 * longer resolves through the tsconfig paths: it fails for every agent in every worktree while
 * passing in CI (#2109). Fixtures belong inside the checkout, under `.scratch/`.
 *
 * Existing offenders are baselined in `scripts/fixture-location-baseline.json`; the list only
 * shrinks. A line can be exempted with `// fixture-location: allow <reason>` on it or the line above.
 *
 *   bun run check:fixture-location
 *   bun run check:fixture-location --write
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { RatchetFinding } from "./ratchet";
import { runRatchet } from "./ratchet";

const ROOTS = ["packages", "apps", "scripts", "examples", "registry"];
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage", "Games"]);
const TEMP_CALLS = [
  { name: "tmpdir()", pattern: /\btmpdir\s*\(/ },
  { name: "mkdtemp()", pattern: /\bmkdtemp(Sync)?\s*\(/ },
  { name: "process.env.TEMP", pattern: /process\.env\.TEMP\b/ },
  { name: "process.env.TMPDIR", pattern: /process\.env\.TMPDIR\b/ },
];
const MARKER = /\/\/\s*fixture-location:\s*allow\s+(\S.*)$/;
/** This checker's own test holds temp paths as fixture text, the way the spawn-timeout gate does. */
const SELF_TEST = "check-fixture-location.test.ts";

export interface FixtureHit {
  /** 1-based line number. */
  line: number;
  token: string;
}

export function findTempFixtureUsage(source: string): FixtureHit[] {
  const lines = source.split("\n");
  const hits: FixtureHit[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const token = TEMP_CALLS.find((entry) => entry.pattern.test(line));
    if (token === undefined) continue;
    if (MARKER.test(line) || (index > 0 && MARKER.test(lines[index - 1]!))) continue;
    hits.push({ line: index + 1, token: token.name });
  }
  return hits;
}

export interface FixtureFinding extends RatchetFinding {
  key: string;
  where: string;
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.startsWith(".") || SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.test\.tsx?$/.test(entry) && entry !== SELF_TEST) out.push(path);
  }
  return out;
}

/** One finding per test file, so the baseline is a list of files to fix rather than lines to drift. */
export function scanFixtureLocations(root: string): FixtureFinding[] {
  const findings: FixtureFinding[] = [];
  for (const dir of ROOTS) {
    for (const file of walk(join(root, dir)).sort()) {
      const key = relative(root, file).split(sep).join("/");
      const hits = findTempFixtureUsage(readFileSync(file, "utf8"));
      if (hits.length === 0) continue;
      const first = hits[0]!;
      findings.push({
        key,
        where: `${key}:${first.line} (${hits.map((hit) => hit.token).join(", ")})`,
      });
    }
  }
  return findings;
}

export const GUIDANCE =
  "Build the fixture inside the checkout: `.scratch/<name>` under the repository root, removed in the\n" +
  "test's cleanup. A path from `tmpdir()` or `mkdtemp()` has no `@jgengine/*` resolution, so the test\n" +
  "passes in CI and fails for every agent in every worktree (#2109). If a temp file is genuinely all\n" +
  "the test needs (no engine imports, plain bytes on disk), mark the line:\n" +
  "  // fixture-location: allow <why a workspace path is not needed>";

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf("--root");
  const root = at < 0 ? fileURLToPath(new URL("..", import.meta.url)) : argv[at + 1];
  if (root === undefined) {
    console.error("check-fixture-location: --root needs a value");
    process.exit(2);
  }
  runRatchet(
    {
      name: "check-fixture-location",
      baselineRel: "scripts/fixture-location-baseline.json",
      scan: scanFixtureLocations,
      guidance: GUIDANCE,
    },
    root,
    argv,
  );
}
