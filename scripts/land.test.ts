import { afterEach, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  checkVerdict,
  chooseBody,
  forcePushArgs,
  formatFailures,
  landRefusal,
  parseArgs,
  pickFragment,
  syncOntoBase,
} from "./land";
import type { Run } from "./land";

test("parses flags with values and defaults the base to beta", () => {
  expect(parseArgs([])).toEqual({ base: "beta" });
  expect(parseArgs(["--verify", "bun run ship:preflight"])).toEqual({
    base: "beta",
    verify: "bun run ship:preflight",
  });
  expect(parseArgs(["--title", "Menus", "--body-file", ".scratch/body.md", "--base", "beta"])).toEqual({
    base: "beta",
    title: "Menus",
    bodyFile: ".scratch/body.md",
  });
});

test("rejects a flag without a value and an unknown flag instead of guessing", () => {
  expect(() => parseArgs(["--verify"])).toThrow("--verify needs a value");
  expect(() => parseArgs(["--verify", "--title"])).toThrow("--verify needs a value");
  expect(() => parseArgs(["--bogus"])).toThrow("unknown argument --bogus");
});

test("takes the fragment named after the branch even when another fragment is newer", () => {
  const files = [
    { path: "changes/other-work.md", text: "### Added\n\n- Other.\n", mtimeMs: 900 },
    { path: "changes/agent-lane-a-a1-12-land-and-shard.md", text: "### Changed\n\n- Mine.\n", mtimeMs: 100 },
  ];
  expect(pickFragment(files, "agent/lane-a-a1-12-land-and-shard")?.text).toContain("Mine.");
});

test("falls back to the newest fragment when no fragment matches the branch", () => {
  const files = [
    { path: "changes/old.md", text: "old", mtimeMs: 100 },
    { path: "changes/new.md", text: "new", mtimeMs: 900 },
  ];
  expect(pickFragment(files, "agent/somewhere-else")?.text).toBe("new");
  expect(pickFragment([], "agent/somewhere-else")).toBeNull();
});

test("builds the PR body from fragment, then body file, then summary", () => {
  expect(chooseBody({ fragment: "### Added\n\n- Note.\n", bodyFile: "file body", summary: "summary" })).toBe(
    "### Added\n\n- Note.",
  );
  expect(chooseBody({ fragment: "  \n", bodyFile: "file body", summary: "summary" })).toBe("file body");
  expect(chooseBody({ bodyFile: null, summary: " summary " })).toBe("summary");
});

test("maps a green check list to no failures", () => {
  expect(
    checkVerdict([
      { name: "ci", state: "SUCCESS", bucket: "pass" },
      { name: "perf", state: "SKIPPED", bucket: "skipping" },
      { name: "smoke", state: "SUCCESS" },
    ]),
  ).toEqual({ failures: [], pending: [] });
});

test("names every failing check with its url and lists pending separately", () => {
  const verdict = checkVerdict([
    { name: "ci", state: "SUCCESS", bucket: "pass" },
    { name: "test (core-rest)", state: "FAILURE", bucket: "fail", link: "https://example.test/job/1" },
    { name: "quick", state: "CANCELLED" },
    { name: "perf", state: "PENDING", bucket: "pending" },
  ]);
  expect(verdict.failures).toEqual([
    { name: "test (core-rest)", url: "https://example.test/job/1" },
    { name: "quick", url: "" },
  ]);
  expect(verdict.pending).toEqual(["perf"]);
  expect(formatFailures(verdict.failures)).toEqual([
    "  test (core-rest) https://example.test/job/1",
    "  quick",
  ]);
});

test("a watch timeout with only pending checks blocks the merge", () => {
  const verdict = checkVerdict([{ name: "test (ui)", state: "IN_PROGRESS", bucket: "pending" }]);
  expect(verdict.failures).toEqual([]);
  expect(verdict.pending).toEqual(["test (ui)"]);
});

test("a cancelled check blocks the merge like a failure", () => {
  const verdict = checkVerdict([{ name: "test (sdk)", state: "CANCELLED", bucket: "cancel", link: "u" }]);
  expect(verdict.failures).toEqual([{ name: "test (sdk)", url: "u" }]);
  expect(verdict.pending).toEqual([]);
});

test("refuses main, the base branch and a dirty tree", () => {
  expect(landRefusal("main", "", "beta")).toContain("refusing to land main");
  expect(landRefusal("beta", "", "beta")).toContain("refusing to land beta");
  expect(landRefusal("agent/x", " M scripts/land.ts\n", "beta")).toContain("dirty tree");
  expect(landRefusal("agent/x", "  \n", "beta")).toBeNull();
});

const SCRATCH = join(import.meta.dir, "..", ".scratch");
const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function gitIn(cwd: string, args: string[]): Run {
  const result = Bun.spawnSync({
    cmd: ["git", "-c", "user.email=land@example.test", "-c", "user.name=Land", ...args],
    cwd,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { status: result.exitCode ?? 1, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

function gitOk(cwd: string, args: string[]): string {
  const result = gitIn(cwd, args);
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

function commit(cwd: string, file: string, text: string, message: string): void {
  writeFileSync(join(cwd, file), text);
  gitOk(cwd, ["add", "-A"]);
  gitOk(cwd, ["commit", "-q", "-m", message]);
}

/**
 * A bare origin, a work clone on `beta`, a partner clone that moves `beta` forward, and one
 * task branch. Everything lives in `.scratch`, so the fixture gate's own rule holds here too.
 */
function originWithBeta(): { bare: string; work: string; partner: string; base: string } {
  const root = join(SCRATCH, `land-${crypto.randomUUID()}`);
  made.push(root);
  mkdirSync(root, { recursive: true });
  const bare = join(root, "origin.git");
  const work = join(root, "work");
  const partner = join(root, "partner");
  gitOk(root, ["init", "-q", "--bare", "-b", "beta", bare]);
  gitOk(root, ["init", "-q", "-b", "beta", work]);
  commit(work, "shared.txt", "one\n", "base");
  gitOk(work, ["remote", "add", "origin", bare]);
  gitOk(work, ["push", "-q", "-u", "origin", "beta"]);
  gitOk(root, ["clone", "-q", bare, partner]);
  const base = gitOk(work, ["rev-parse", "HEAD"]);
  return { bare, work, partner, base };
}

test("a task branch pushed before beta moved is rebased and force-pushed instead of rejected", () => {
  const { bare, work, partner, base } = originWithBeta();

  gitOk(work, ["checkout", "-q", "-b", "agent/behind"]);
  commit(work, "task.txt", "task\n", "task work");
  gitOk(work, ["push", "-q", "-u", "origin", "agent/behind"]);

  commit(partner, "upstream.txt", "moved\n", "beta moves on");
  gitOk(partner, ["push", "-q", "origin", "beta"]);
  const movedBeta = gitOk(partner, ["rev-parse", "HEAD"]);
  expect(movedBeta).not.toBe(base);
  expect(gitOk(work, ["rev-list", "--count", "HEAD..origin/beta"])).toBe("0");

  const sync = syncOntoBase({ branch: "agent/behind", base: "beta", git: (args) => gitIn(work, args) });
  expect(sync).toEqual({ rebased: true, refusal: null });

  const remoteTip = gitOk(bare, ["rev-parse", "refs/heads/agent/behind"]);
  expect(remoteTip).toBe(gitOk(work, ["rev-parse", "HEAD"]));
  expect(gitIn(bare, ["merge-base", "--is-ancestor", movedBeta, remoteTip]).status).toBe(0);
  expect(gitIn(work, ["rev-list", "--count", "HEAD..origin/beta"]).stdout.trim()).toBe("0");
});

test("a branch land did not push is refused, and the remote copy is left alone", () => {
  const { bare, work, partner, base } = originWithBeta();

  gitOk(partner, ["checkout", "-q", "-b", "agent/foreign", "beta"]);
  commit(partner, "theirs.txt", "theirs\n", "someone else's commit");
  gitOk(partner, ["push", "-q", "-u", "origin", "agent/foreign"]);
  const untouched = gitOk(bare, ["rev-parse", "refs/heads/agent/foreign"]);

  gitOk(work, ["checkout", "-q", "-b", "agent/foreign", base]);
  commit(work, "mine.txt", "mine\n", "my commit on the same name");

  const sync = syncOntoBase({ branch: "agent/foreign", base: "beta", git: (args) => gitIn(work, args) });
  expect(sync.rebased).toBe(false);
  expect(sync.refusal).toContain("refuses to force-push a branch it did not push");
  expect(gitOk(bare, ["rev-parse", "refs/heads/agent/foreign"])).toBe(untouched);
});

test("the only force land uses is a lease on the branch it pushed", () => {
  expect(forcePushArgs("agent/lane-x")).toEqual(["push", "--force-with-lease=agent/lane-x", "origin", "HEAD:agent/lane-x"]);
});
