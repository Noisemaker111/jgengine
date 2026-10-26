// What `verify:fast` already proved. A unit (one test file, a type-check, a gate, a boot) that
// passed is remembered under a key made of its id, this Bun and the content of every file that can
// decide it (`unitInputs` in verify-fast.ts; `*` is the whole tree). The same key later means the
// same bytes are on disk, so the run would repeat a known answer: `lane:close` re-running what a
// lane just ran, or a rebase that only brought in other work, re-checks only the units whose files
// moved. No commit is part of a key. A failure is never remembered.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** At most this many passes are kept; the oldest go first. */
export const MAX_ENTRIES = 20_000;

/** The input that stands for every file in the tree. */
export const WHOLE_TREE = "*";

export interface PassCache {
  fresh(unit: string, inputs: readonly string[]): boolean;
  record(unit: string, inputs: readonly string[]): void;
  save(): void;
}

export interface PassCacheOptions {
  /** Where the passes are stored. */
  file: string;
  /** A content digest for a path; `absent` when it does not exist. */
  digest: (path: string) => string;
  /** Every path in the tree, for `*`. */
  tree: () => readonly string[];
  /** Part of every key: a different Bun can run the same files differently. */
  runtime?: string;
}

export function openPassCache(options: PassCacheOptions): PassCache {
  const runtime = options.runtime ?? `bun ${Bun.version}`;
  let treeDigest: string | undefined;
  const wholeTree = (): string => {
    if (treeDigest === undefined) {
      const hash = createHash("sha256");
      for (const path of [...options.tree()].sort()) hash.update(`${path}\0${options.digest(path)}\n`);
      treeDigest = hash.digest("hex");
    }
    return treeDigest;
  };
  const key = (unit: string, inputs: readonly string[]): string => {
    const hash = createHash("sha256").update(`${unit}\0${runtime}\0`);
    for (const path of [...inputs].sort()) hash.update(`${path}\0${path === WHOLE_TREE ? wholeTree() : options.digest(path)}\n`);
    return hash.digest("hex");
  };

  let passed: Record<string, number> = {};
  try {
    if (existsSync(options.file)) passed = JSON.parse(readFileSync(options.file, "utf8")) as Record<string, number>;
  } catch {
    passed = {};
  }

  return {
    fresh: (unit, inputs) => passed[key(unit, inputs)] !== undefined,
    record: (unit, inputs) => {
      passed[key(unit, inputs)] = Date.now();
    },
    save: () => {
      const kept = Object.entries(passed)
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_ENTRIES);
      mkdirSync(dirname(options.file), { recursive: true });
      writeFileSync(options.file, `${JSON.stringify(Object.fromEntries(kept))}\n`, "utf8");
    },
  };
}

/**
 * Content digests for a checkout without reading every file: git's own blob ids for tracked files
 * the working tree has not changed, and a hash of the bytes for the `dirty` ones (changed, staged
 * or untracked). A path in neither is absent.
 */
export function treeDigests(root: string, dirty: Iterable<string>): (path: string) => string {
  const listed = spawnSync("git", ["ls-files", "-s"], { cwd: root, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  const blobs = new Map<string, string>();
  for (const line of (listed.stdout ?? "").split("\n")) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const fields = line.slice(0, tab).split(" ");
    if (fields[1] !== undefined) blobs.set(line.slice(tab + 1), fields[1]);
  }
  const own = new Map<string, string>();
  const dirtySet = new Set(dirty);
  return (path) => {
    if (!dirtySet.has(path)) return blobs.get(path) ?? "absent";
    let known = own.get(path);
    if (known === undefined) {
      const full = join(root, path);
      known = existsSync(full) ? `sha256:${createHash("sha256").update(readFileSync(full)).digest("hex")}` : "absent";
      own.set(path, known);
    }
    return known;
  };
}
