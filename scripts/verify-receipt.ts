import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ScheduledStep, StepResult } from "./stepScheduler";

/** A separate receipt and raw failure output for each invocation. */
export function createVerifyReceipt(root: string, data: Record<string, unknown>, steps: readonly ScheduledStep[], runDir?: string) {
  const dir = runDir ?? join(root, ".scratch", "verify-fast", "runs", `${Date.now()}-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "receipt.json");
  const started = new Date().toISOString();
  const entries: Record<string, Record<string, unknown>> = {};
  for (const step of steps) entries[step.name] = { status: "pending", needs: step.needs ?? [], queuedAt: started };
  const receipt: Record<string, unknown> = { version: 1, ...data, startedAt: started, status: "running", steps: entries, timing: "Intervals can overlap; do not sum them to obtain elapsed time. Unmeasured time is unknown." };
  const save = (): void => {
    const temp = join(dir, "receipt.tmp");
    writeFileSync(temp, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    renameSync(temp, path);
  };
  save();
  return {
    dir, path,
    plan(data: Record<string, unknown>, selected: readonly ScheduledStep[]): void {
      Object.assign(receipt, data);
      const queuedAt = new Date().toISOString();
      for (const step of selected) entries[step.name] = { status: "pending", needs: step.needs ?? [], queuedAt };
      save();
    },
    start(step: ScheduledStep): void {
      entries[step.name] = { ...entries[step.name], status: "running", startedAt: new Date().toISOString() };
      save();
    },
    settle(result: StepResult): void {
      let outputFile: string | undefined;
      if (!result.ok && result.blockedBy === undefined) {
        outputFile = `${Object.keys(entries).indexOf(result.name)}-failure.log`;
        writeFileSync(join(dir, outputFile), result.output, "utf8");
      }
      entries[result.name] = { ...entries[result.name], status: result.blockedBy !== undefined ? "blocked" : result.ok ? "passed" : "failed", endedAt: new Date().toISOString(), ms: result.ms, ...(result.blockedBy === undefined ? {} : { blockedBy: result.blockedBy }), ...(outputFile === undefined ? {} : { outputFile }) };
      save();
    },
    /** Add top-level fields: the tree the run proves, or the receipt it reused. */
    note(data: Record<string, unknown>): void {
      Object.assign(receipt, data);
      save();
    },
    finish(ok: boolean): void {
      receipt["status"] = ok ? "passed" : "failed";
      receipt["endedAt"] = new Date().toISOString();
      save();
    },
    abort(error: unknown): void {
      receipt["error"] = error instanceof Error ? error.stack ?? error.message : String(error);
      receipt["status"] = "failed";
      receipt["endedAt"] = new Date().toISOString();
      save();
    },
  };
}

/**
 * How much a run proves: `--cheap` the type-checks and gates, a plain run those and the tests and
 * boots, `--landing` also the site build, `--full` what CI runs.
 */
export type VerifyScope = "cheap" | "fast" | "landing" | "full";
const SCOPE_RANK: Readonly<Record<VerifyScope, number>> = { cheap: 0, fast: 1, landing: 2, full: 3 };

/** What a passing receipt must match for its pass to stand for a new run. */
export interface ReuseKey {
  /** The working tree's id (`workingTree`): the same id is the same bytes. */
  tree: string;
  /** The commit the diff is taken from: the same tree against another merge base is another plan. */
  mergeBase: string;
  runtime: string;
  scope: VerifyScope;
  skillApi: boolean;
}

/** The receipts this many newest runs left are read; an older pass is not looked for. */
const REUSE_LOOKBACK = 40;

/**
 * The newest passing receipt under `.scratch/verify-fast/runs/` that proved at least what this run
 * would, on this exact tree: a run whose tree changed while it ran records no tree and never matches.
 */
export function passingReceipt(root: string, key: ReuseKey): { path: string; endedAt: string } | null {
  const runs = join(root, ".scratch", "verify-fast", "runs");
  let dirs: { path: string; at: number }[];
  try {
    dirs = readdirSync(runs).map((name) => {
      const path = join(runs, name, "receipt.json");
      try {
        return { path, at: statSync(path).mtimeMs };
      } catch {
        return { path, at: 0 };
      }
    });
  } catch {
    return null;
  }
  for (const { path, at } of dirs.sort((a, b) => b.at - a.at).slice(0, REUSE_LOOKBACK)) {
    if (at === 0) continue;
    let receipt: Record<string, unknown>;
    try {
      receipt = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    } catch {
      continue;
    }
    const scope = receipt["scope"];
    if (receipt["status"] !== "passed" || typeof scope !== "string" || !(scope in SCOPE_RANK)) continue;
    if (receipt["tree"] !== key.tree || receipt["mergeBase"] !== key.mergeBase || receipt["runtime"] !== key.runtime) continue;
    if (SCOPE_RANK[scope as VerifyScope] < SCOPE_RANK[key.scope]) continue;
    if (key.skillApi && receipt["skillApi"] !== true && scope !== "full") continue;
    return { path, endedAt: typeof receipt["endedAt"] === "string" ? receipt["endedAt"] : "" };
  }
  return null;
}

function git(root: string, args: readonly string[], env: Record<string, string> = {}): string {
  const run = spawnSync("git", [...args], { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, env: { ...process.env, ...env } });
  if (run.status !== 0) throw new Error(`git ${args.join(" ")}: ${(run.stderr ?? "").trim()}`);
  return run.stdout ?? "";
}

/**
 * The tree id of the working tree as it stands, tracked changes and untracked files alike (ignored
 * files left out). The branch, the index and the files are untouched: a private index, seeded from
 * the real one so only changed files are hashed, builds it. Two checks that see the same id saw the
 * same bytes.
 */
export function workingTree(root: string): { tree: string } {
  const dirty = git(root, ["status", "--porcelain=v1", "--untracked-files=all"]).trim().length > 0;
  if (!dirty) return { tree: git(root, ["rev-parse", "HEAD^{tree}"]).trim() };
  const scratch = mkdtempSync(join(tmpdir(), "verify-index-"));
  try {
    const index = join(scratch, "index");
    const realIndex = git(root, ["rev-parse", "--path-format=absolute", "--git-path", "index"]).trim();
    try {
      copyFileSync(realIndex, index);
    } catch {
      // No index yet: the private one starts empty and every file is hashed once.
    }
    git(root, ["add", "-A"], { GIT_INDEX_FILE: index });
    return { tree: git(root, ["write-tree"], { GIT_INDEX_FILE: index }).trim() };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
