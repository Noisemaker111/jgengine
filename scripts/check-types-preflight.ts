// Fast guard run before a package's `tsgo` type-check.
//
// Package `exports` point at `dist/`, so a bare `import … from "@jgengine/core"`
// resolves through node_modules to `dist/index.d.ts`. After a clean install that
// file does not exist until `bun run build` (or `bun run agent:bootstrap`) has run,
// and `tsgo` then emits hundreds of misleading "Cannot find module '@jgengine/*'"
// errors with nothing pointing at the real prerequisite. This preflight detects the
// missing upstream dist with a couple of existsSync checks and exits non-zero with a
// clear fix pointer BEFORE that wall of TS errors. When every required dist is present
// it is a no-op (exit 0) and adds no observable behavior.
//
// Runs from a package cwd (e.g. `bun ../../scripts/check-types-preflight.ts`). Works
// whether invoked directly (`bun run --cwd packages/react check-types`) or via the
// root aggregate check-types. Requiring every sibling `@jgengine/*` dist is deliberate:
// package check-types only ever runs after the root build / bootstrap has produced all
// dist, so a missing one is always a real, actionable prerequisite — never a false alarm.
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";

const SCOPE = "@jgengine/";

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function findRepoRoot(start: string): string {
  let dir = start;
  for (;;) {
    const manifest = readJson(join(dir, "package.json"));
    if (manifest && manifest.workspaces) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

function isBuilt(pkgDir: string): boolean {
  const manifest = readJson(join(pkgDir, "package.json"));
  // Prefer the declared `.` types entrypoint (index-style packages like @jgengine/core).
  const dotTypes = (manifest?.exports as Record<string, { types?: string }> | undefined)?.["."]?.types
    ?? (manifest?.types as string | undefined);
  if (dotTypes) return existsSync(join(pkgDir, dotTypes));
  // Wildcard/subpath-only packages (e.g. @jgengine/shell) have no `.` entry — their
  // built signal is simply a non-empty dist/ directory of emitted declarations.
  const distDir = join(pkgDir, "dist");
  try {
    return existsSync(distDir) && readdirSync(distDir).length > 0;
  } catch {
    return false;
  }
}

// Resolve a sibling @jgengine/* dependency's package directory the way a bare import does —
// via node_modules, then a packages/<name> fallback — and report whether its dist is built.
function resolveBuilt(dep: string, packageDir: string, repoRoot: string): { ok: boolean } | null {
  const candidates = [join(packageDir, "node_modules", dep), join(repoRoot, "node_modules", dep)];
  let pkgDir: string | undefined;
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) {
        pkgDir = realpathSync(candidate);
        break;
      }
    } catch {
      // ignore unreadable candidate
    }
  }
  if (!pkgDir) {
    const guess = join(repoRoot, "packages", dep.slice(SCOPE.length));
    if (existsSync(guess)) pkgDir = guess;
    else return null; // unknown external dep — nothing to assert
  }
  return { ok: isBuilt(pkgDir) };
}

function main(): void {
  const packageDir = process.cwd();
  const manifest = readJson(join(packageDir, "package.json"));
  if (!manifest) process.exit(0);

  const deps = {
    ...(manifest.dependencies as Record<string, string> | undefined),
    ...(manifest.peerDependencies as Record<string, string> | undefined),
    ...(manifest.devDependencies as Record<string, string> | undefined),
  };
  const jgDeps = Object.keys(deps).filter((d) => d.startsWith(SCOPE));
  if (jgDeps.length === 0) process.exit(0);

  const repoRoot = findRepoRoot(packageDir);
  const missing: string[] = [];
  for (const dep of jgDeps) {
    const entry = resolveBuilt(dep, packageDir, repoRoot);
    if (entry && !entry.ok) missing.push(dep);
  }

  if (missing.length === 0) process.exit(0);

  const pkgName = (manifest.name as string | undefined) ?? packageDir;
  console.error(
    `\ncheck-types-preflight: Upstream @jgengine/* dist not built — run \`bun run agent:bootstrap\` (or \`bun run build\`) first.\n` +
      `  ${pkgName} type-checks resolve bare @jgengine/* imports to each package's dist/, which is missing for: ${missing.join(", ")}.\n` +
      `  Without it, tsgo emits hundreds of misleading "Cannot find module" errors. Building the upstream dist fixes them all.\n`,
  );
  process.exit(1);
}

main();
