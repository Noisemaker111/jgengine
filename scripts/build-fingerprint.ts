// `bun run build` rebuilt every package on every `bun run check` (the export-manifest and
// skill-api checks read dist), and core's build deletes and recompiles its dist each time, so an
// unchanged tree paid the whole build again. The build now ends by writing a fingerprint of every
// file it reads, and the check's build stage skips the build when the tree still has that
// fingerprint. The fingerprint is git's blob id of each input (the index for clean files, the
// working tree's bytes for changed and untracked ones), so a deleted, renamed or edited source
// always rebuilds; mtimes are not trusted, because a branch switch can leave dist newer than a
// source it no longer matches.
//
//   bun scripts/build-fingerprint.ts           # build unless dist matches the sources
//   bun scripts/build-fingerprint.ts --clear   # the build starts: forget the old fingerprint, note the tree it reads
//   bun scripts/build-fingerprint.ts --write   # the build finished: that tree is what dist holds
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/** Everything `bun run build` reads: the packages, the registry source, and the build's own scripts and config. */
export const BUILD_INPUTS = [
  "packages",
  "registry",
  "package.json",
  "bun.lock",
  "tsconfig.base.json",
  "scripts/build-engine.ts",
  "scripts/build-registry.ts",
  "scripts/fix-extensions.ts",
  "scripts/build-fingerprint.ts",
] as const;

/** Where the last finished build's fingerprint is kept. */
export const FINGERPRINT_PATH = join(".scratch", "build", "fingerprint.txt");

function git(args: readonly string[], cwd: string, input?: string): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...(input === undefined ? {} : { input }) });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

/**
 * One line per input file, `<blob id> <path>`, sorted: the index's id for a clean file and the
 * working tree's for a changed or untracked one, `deleted` for one removed from the working tree.
 */
export function buildFingerprint(cwd = root): string {
  const entries = new Map<string, string>();
  for (const line of git(["ls-files", "-s", "--", ...BUILD_INPUTS], cwd).split("\n")) {
    const match = /^\d+ ([0-9a-f]+) \d\t(.+)$/.exec(line);
    if (match !== null) entries.set(match[2]!, match[1]!);
  }
  const dirty = git(["ls-files", "-m", "-o", "--exclude-standard", "--", ...BUILD_INPUTS], cwd).split("\n").filter((path) => path.length > 0);
  const present = [...new Set(dirty)].filter((path) => existsSync(join(cwd, path)));
  for (const path of dirty) if (!present.includes(path)) entries.set(path, "deleted");
  if (present.length > 0) {
    const ids = git(["hash-object", "--stdin-paths"], cwd, `${present.join("\n")}\n`).trim().split("\n");
    present.forEach((path, index) => entries.set(path, ids[index] ?? "unreadable"));
  }
  return [...entries].map(([path, id]) => `${id} ${path}`).sort().join("\n");
}

/** The packages whose build emits a dist; a missing one means the build never finished. */
function missingDist(cwd: string): string[] {
  const packages = join(cwd, "packages");
  return readdirSync(packages).filter((name) => existsSync(join(packages, name, "tsconfig.build.json")) && !existsSync(join(packages, name, "dist")));
}

/** Why the build must run, or null when dist was built from exactly these sources. */
export function buildNeeded(cwd = root): string | null {
  const path = join(cwd, FINGERPRINT_PATH);
  if (!existsSync(path)) return "no finished build recorded in this checkout";
  const missing = missingDist(cwd);
  if (missing.length > 0) return `no dist in ${missing.join(", ")}`;
  const before = new Map(readFileSync(path, "utf8").split("\n").map((line) => [line.slice(line.indexOf(" ") + 1), line] as const));
  const now = buildFingerprint(cwd).split("\n");
  const changed = now.filter((line) => before.get(line.slice(line.indexOf(" ") + 1)) !== line);
  const nowPaths = new Set(now.map((line) => line.slice(line.indexOf(" ") + 1)));
  const gone = [...before.keys()].filter((key) => !nowPaths.has(key));
  const differ = [...changed.map((line) => line.slice(line.indexOf(" ") + 1)), ...gone];
  if (differ.length === 0) return null;
  return `${differ.length} input(s) changed since the last build, e.g. ${differ.slice(0, 3).join(", ")}`;
}

function main(argv: readonly string[]): number {
  const path = join(root, FINGERPRINT_PATH);
  const pending = `${path}.pending`;
  if (argv.includes("--clear")) {
    rmSync(path, { force: true });
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(pending, buildFingerprint());
    return 0;
  }
  if (argv.includes("--write")) {
    if (existsSync(pending)) renameSync(pending, path);
    return 0;
  }
  const reason = buildNeeded();
  if (reason === null) {
    console.log(`build: skipped, dist was built from these exact sources (${FINGERPRINT_PATH}); \`bun run build\` forces one`);
    return 0;
  }
  console.log(`build: ${reason}; running bun run build`);
  return spawnSync("bun", ["run", "build"], { cwd: root, stdio: "inherit" }).status ?? 1;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
