/**
 * Phase 1.1 export surface gate:
 * 1. package.json named exports match scripts/public-exports.json (via sync --check)
 * 2. Games may not import new @jgengine/{core,shell,react} subpaths outside the curated list
 *    (shrink-only baseline scripts/export-surface-baseline.json)
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const PUBLIC = join(root, "scripts/public-exports.json");
const BASELINE = join(root, "scripts/export-surface-baseline.json");

const publicExports = JSON.parse(readFileSync(PUBLIC, "utf8")) as Record<string, string[]>;
const curated = new Map<string, Set<string>>();
for (const [pkg, subs] of Object.entries(publicExports)) {
  curated.set(pkg, new Set(subs));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.includes(".test.")) out.push(full);
  }
  return out;
}

function rel(path: string): string {
  return path.replace(root + "\\", "").replace(root + "/", "").replaceAll("\\", "/");
}

// 1) package.json sync
const sync = spawnSync("bun", ["scripts/sync-package-exports.ts", "--check"], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
const problems: string[] = [];
if (sync.status !== 0) {
  problems.push((sync.stderr || sync.stdout || "sync-package-exports --check failed").trim());
}

// 2) game import ratchet
const baseline: string[] = existsSync(BASELINE)
  ? (JSON.parse(readFileSync(BASELINE, "utf8")) as string[])
  : [];
const baselineSet = new Set(baseline);
const found = new Set<string>();
const re = /from\s+["'](@jgengine\/(core|shell|react)(?:\/[^"']+)?)["']/g;

const gamesDir = join(root, "Games");
for (const name of readdirSync(gamesDir)) {
  const src = join(gamesDir, name, "src");
  if (!existsSync(src) || !statSync(src).isDirectory()) continue;
  for (const file of walk(src)) {
    const text = readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    const local = new RegExp(re.source, "g");
    while ((m = local.exec(text))) {
      const imp = m[1]!;
      const parts = imp.split("/");
      const pkg = `${parts[0]}/${parts[1]}`;
      const sub = parts.length > 2 ? `./${parts.slice(2).join("/")}` : ".";
      const allowed = curated.get(pkg);
      if (allowed === undefined) continue;
      if (allowed.has(sub)) continue;
      const key = `${rel(file)}:${imp}`;
      found.add(key);
    }
  }
}

const newSmells = [...found].filter((k) => !baselineSet.has(k)).sort();
const stale = [...baselineSet].filter((k) => !found.has(k)).sort();

for (const smell of newSmells) {
  problems.push(
    `${smell}: game import is outside the curated public export surface (scripts/public-exports.json). ` +
      `Prefer a named happy-path export (@jgengine/shell/gameKit, barrels, or an existing curated subpath). ` +
      `If this deep path is intentional, add it to public-exports.json and re-run bun scripts/sync-package-exports.ts, ` +
      `or temporarily baseline it in scripts/export-surface-baseline.json after review.`,
  );
}
for (const s of stale) {
  problems.push(
    `scripts/export-surface-baseline.json lists "${s}" but that import is gone — remove it (baseline only shrinks).`,
  );
}

if (problems.length > 0) {
  console.error(`\ncheck-export-surface: ${problems.length} issue(s):\n` + problems.map((p) => `  ${p}`).join("\n") + "\n");
  process.exit(1);
}

console.log(
  `check-export-surface: clean — curated exports in sync; ${found.size} baselined deep-import exception(s)`,
);
