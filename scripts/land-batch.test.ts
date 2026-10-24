import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  EXIT_BATCH_EMPTY,
  EXIT_BATCH_LANDED,
  EXIT_BATCH_PARTIAL,
  EXIT_BATCH_REFUSED,
  batchBranches,
  explainBatch,
  landBatch,
  mergeMessage,
  parseArgs,
  readBranchList,
  handOffLines,
  readRecord,
  recordPath,
  runOnTip,
} from "./land-batch";
import type { BatchArgs, BatchIo } from "./land-batch";
import type { Git, Run } from "./land";

const slow = (name: string, fn: () => void): void => {
  test(name, fn, 60_000);
};


slow("parses positional branches, a list file and the flags that change what is pushed", () => {
  const args = parseArgs(["agent/a", "agent/b", "--base", "release", "--file", "list.txt", "--skill-api", "--dry-run"]);
  expect(args).toEqual({
    base: "release",
    branches: ["agent/a", "agent/b"],
    file: "list.txt",
    verify: "bun run verify:fast",
    skillApi: true,
    dryRun: true,
    explain: false,
  });
  expect(parseArgs([]).base).toBe("beta");
  expect(parseArgs(["--explain"]).explain).toBe(true);
});

slow("rejects a flag without a value and an unknown flag instead of guessing", () => {
  expect(() => parseArgs(["--file"])).toThrow("--file needs a value");
  expect(() => parseArgs(["--file", "--dry-run"])).toThrow("--file needs a value");
  expect(() => parseArgs(["--everyone"])).toThrow("unknown argument --everyone");
});

slow("a list file is one branch per line, and notes are not branches", () => {
  expect(readBranchList("agent/a\n\n# later\n  agent/b  \r\n")).toEqual(["agent/a", "agent/b"]);
  expect(readBranchList("")).toEqual([]);
});

slow("the list file is landed first, then the command line, each branch once", () => {
  const args: BatchArgs = { base: "beta", branches: ["agent/c", "agent/a"], file: "list.txt", verify: "v", skillApi: false, dryRun: false, explain: false };
  const read = (): string => "agent/a\nagent/b\n";
  expect(batchBranches(args, read)).toEqual(["agent/a", "agent/b", "agent/c"]);
});

slow("a known PR shapes the merge commit the way GitHub writes it", () => {
  expect(mergeMessage("beta", "agent/menus", { number: 2369, title: "Menus" })).toEqual({
    subject: "Merge pull request #2369 from agent/menus",
    body: "Menus",
  });
  expect(mergeMessage("beta", "agent/menus", undefined)).toEqual({
    subject: "Merge branch 'agent/menus' into beta",
    body: "",
  });
});


const SCRATCH = join(import.meta.dir, "..", ".scratch");
const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function gitIn(cwd: string, args: string[]): Run {
  const result = Bun.spawnSync({
    cmd: ["git", "-c", "user.email=batch@example.test", "-c", "user.name=Batch", ...args],
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

/** A bare origin, a work clone on `beta`, and a partner clone that can move `beta`. */
function fixtures(): { bare: string; work: string; partner: string; base: string } {
  const top = join(SCRATCH, `batch-${crypto.randomUUID()}`);
  made.push(top);
  mkdirSync(top, { recursive: true });
  const bare = join(top, "origin.git");
  const work = join(top, "work");
  const partner = join(top, "partner");
  gitOk(top, ["init", "-q", "--bare", "-b", "beta", bare]);
  gitOk(top, ["init", "-q", "-b", "beta", work]);
  commit(work, "shared.txt", "one\n", "base");
  gitOk(work, ["remote", "add", "origin", bare]);
  gitOk(work, ["push", "-q", "-u", "origin", "beta"]);
  gitOk(top, ["clone", "-q", bare, partner]);
  return { bare, work, partner, base: gitOk(work, ["rev-parse", "HEAD"]) };
}

function branch(work: string, name: string, file: string, text: string, message: string): void {
  gitOk(work, ["checkout", "-q", "-b", name, "beta"]);
  commit(work, file, text, message);
  gitOk(work, ["push", "-q", "-u", "origin", name]);
  gitOk(work, ["checkout", "-q", "beta"]);
}

function argsFor(branches: string[], extra: Partial<BatchArgs> = {}): BatchArgs {
  return { base: "beta", branches, verify: "test -z \"$(cat bad.txt 2>/dev/null)\"", skillApi: false, dryRun: false, explain: false, ...extra };
}

/**
 * The verify stand-in reads the work tree it is given: a branch that adds `bad.txt` fails, anything
 * else passes, so a failing branch is exercised without running a real gate.
 */
function batchIo(work: string, log: string[] = [], gh?: (args: string[]) => Run): BatchIo {
  return {
    git: (args) => gitIn(work, args),
    gh: gh ?? (() => ({ status: 1, stdout: "", stderr: "no gh in this test" })),
    verify: () => !existsSync(join(work, "bad.txt")),
    log: (line) => log.push(line),
    error: (line) => log.push(`ERR ${line}`),
    now: Date.now,
  };
}

slow("two good branches land as one push, and the conflicting and failing ones are skipped with a reason", () => {
  const { bare, work, base } = fixtures();
  branch(work, "agent/good-one", "shared.txt", "good one\n", "good one");
  branch(work, "agent/conflicts", "shared.txt", "theirs\n", "conflicting");
  branch(work, "agent/good-two", "two.txt", "two\n", "good two");
  branch(work, "agent/fails", "bad.txt", "bad\n", "fails verify");

  const log: string[] = [];
  const outcome = landBatch(argsFor(["agent/good-one", "agent/conflicts", "agent/good-two", "agent/fails"]), batchIo(work, log));

  expect(outcome.code).toBe(EXIT_BATCH_PARTIAL);
  expect(outcome.landed.map((entry) => entry.branch)).toEqual(["agent/good-one", "agent/good-two"]);
  expect(outcome.skipped.map((entry) => entry.branch)).toEqual(["agent/conflicts", "agent/fails"]);
  expect(outcome.skipped[0]?.why).toContain("shared.txt");
  expect(outcome.skipped[1]?.why).toContain("verify failed");
  expect(outcome.pushed).toBe(true);

  const remote = gitOk(bare, ["rev-parse", "refs/heads/beta"]);
  expect(remote).toBe(outcome.tip!);
  expect(gitIn(bare, ["merge-base", "--is-ancestor", base, remote]).status).toBe(0);
  expect(gitOk(bare, ["log", "--format=%s", "-2"])).toBe("Merge branch 'agent/good-two' into beta\nMerge branch 'agent/good-one' into beta");
  expect(gitOk(bare, ["ls-tree", "--name-only", "beta", "bad.txt"])).toBe("");
  expect(log.some((line) => line.includes("skipped: conflicts with the chain in shared.txt"))).toBe(true);
  expect(log.some((line) => line.includes("waiting for nothing") || line.includes("waits for nothing"))).toBe(true);

  expect(gitOk(work, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("beta");
  expect(gitOk(work, ["status", "--porcelain"])).toBe("");
});

slow("a branch that fails verify leaves the chain where it was, so the next one merges onto good work only", () => {
  const { bare, work } = fixtures();
  branch(work, "agent/good", "one.txt", "one\n", "good");
  branch(work, "agent/fails", "bad.txt", "bad\n", "bad");
  branch(work, "agent/later", "three.txt", "three\n", "later");

  const outcome = landBatch(argsFor(["agent/good", "agent/fails", "agent/later"]), batchIo(work));
  expect(outcome.landed.map((entry) => entry.branch)).toEqual(["agent/good", "agent/later"]);
  const remote = gitOk(bare, ["rev-parse", "refs/heads/beta"]);
  expect(gitOk(bare, ["show", `${remote}:three.txt`])).toBe("three");
  expect(gitIn(bare, ["cat-file", "-e", `${remote}:bad.txt`]).status).not.toBe(0);
});

slow("a base that moved while the batch verified refuses the push instead of forcing it", () => {
  const { bare, work, partner } = fixtures();
  branch(work, "agent/one", "one.txt", "one\n", "one");

  commit(partner, "upstream.txt", "moved\n", "beta moves on");
  const movedBeta = gitOk(partner, ["rev-parse", "HEAD"]);

  const io = batchIo(work);
  let fetches = 0;
  const outcome = landBatch(argsFor(["agent/one"]), {
    ...io,
    git: (args) => {
      if (args[0] === "fetch" && args[3] === "beta" && (fetches += 1) === 2) {
        gitOk(partner, ["push", "-q", "origin", "beta"]);
      }
      return gitIn(work, args);
    },
  });
  expect(outcome.code).toBe(EXIT_BATCH_REFUSED);
  expect(outcome.pushed).toBe(false);
  expect(outcome.skipped.some((entry) => entry.why.includes("moved"))).toBe(true);
  expect(gitOk(bare, ["rev-parse", "refs/heads/beta"])).toBe(movedBeta);
  expect(gitIn(bare, ["cat-file", "-e", `${movedBeta}:one.txt`]).status).not.toBe(0);
});

slow("nothing landing is its own answer, not a push of the base back to itself", () => {
  const { bare, work, base } = fixtures();
  branch(work, "agent/fails", "bad.txt", "bad\n", "fails");

  const outcome = landBatch(argsFor(["agent/fails"]), batchIo(work));
  expect(outcome.code).toBe(EXIT_BATCH_EMPTY);
  expect(outcome.pushed).toBe(false);
  expect(gitOk(bare, ["rev-parse", "refs/heads/beta"])).toBe(base);
});

slow("--dry-run builds and verifies the chain and pushes nothing", () => {
  const { bare, work, base } = fixtures();
  branch(work, "agent/one", "one.txt", "one\n", "one");

  const outcome = landBatch(argsFor(["agent/one"], { dryRun: true }), batchIo(work));
  expect(outcome.code).toBe(EXIT_BATCH_LANDED);
  expect(outcome.pushed).toBe(false);
  expect(outcome.tip).not.toBe(base);
  expect(gitOk(bare, ["rev-parse", "refs/heads/beta"])).toBe(base);
});

slow("--skill-api runs once on the finished tip, and a red tip pushes nothing", () => {
  const first = fixtures();
  branch(first.work, "agent/one", "one.txt", "one\n", "one");

  const seen: string[] = [];
  const ran = { ...batchIo(first.work), verify: (command: string) => (seen.push(command), true) };
  landBatch(argsFor(["agent/one"], { skillApi: true }), ran);
  expect(seen).toEqual(["test -z \"$(cat bad.txt 2>/dev/null)\"", "test -z \"$(cat bad.txt 2>/dev/null)\" --skill-api"]);

  const second = fixtures();
  branch(second.work, "agent/one", "one.txt", "one\n", "one");
  const red = { ...batchIo(second.work), verify: (command: string) => !command.endsWith("--skill-api") };
  const outcome = landBatch(argsFor(["agent/one"], { skillApi: true }), red);
  expect(outcome.code).toBe(EXIT_BATCH_REFUSED);
  expect(outcome.pushed).toBe(false);
  expect(gitOk(second.bare, ["rev-parse", "refs/heads/beta"])).toBe(second.base);
});

slow("an already-landed branch is named, not merged twice", () => {
  const { work } = fixtures();
  branch(work, "agent/one", "one.txt", "one\n", "one");
  landBatch(argsFor(["agent/one"]), batchIo(work));

  const again = landBatch(argsFor(["agent/one"]), batchIo(work));
  expect(again.landed).toEqual([]);
  expect(again.skipped[0]?.why).toContain("already in beta");
});

slow("--explain names the commit that cannot verify on its own", () => {
  const { work } = fixtures();
  branch(work, "agent/one", "one.txt", "one\n", "one");
  branch(work, "agent/two", "two.txt", "two\n", "two");
  const outcome = landBatch(argsFor(["agent/one", "agent/two"]), batchIo(work));
  expect(outcome.code).toBe(EXIT_BATCH_LANDED);

  const record = readRecord((args) => gitIn(work, args));
  expect(record?.entries.map((entry) => entry.branch)).toEqual(["agent/one", "agent/two"]);
  expect(existsSync(recordPath((args) => gitIn(work, args)))).toBe(true);

  const log: string[] = [];
  const sane = explainBatch(argsFor([]), { git: (args) => gitIn(work, args), verify: () => true, log: (l) => log.push(l), error: (l) => log.push(`ERR ${l}`) });
  expect(sane).toBe(EXIT_BATCH_LANDED);
  expect(log.some((line) => line.includes("CI-only"))).toBe(true);

  const red: string[] = [];
  const second = record!.entries[1]!;
  const blamed = explainBatch(argsFor([]), {
    git: (args) => gitIn(work, args),
    verify: () => gitIn(work, ["rev-parse", "HEAD"]).stdout.trim() !== second.commit,
    log: (line) => red.push(line),
    error: (line) => red.push(`ERR ${line}`),
  });
  expect(blamed).toBe(EXIT_BATCH_PARTIAL);
  expect(red.some((line) => line.includes("likely cause: agent/two"))).toBe(true);
});

slow("--explain without a recorded batch says so instead of guessing", () => {
  const { work } = fixtures();
  const log: string[] = [];
  const code = explainBatch(argsFor([]), { git: (args) => gitIn(work, args), verify: () => true, log: (l) => log.push(l), error: (l) => log.push(l) });
  expect(code).toBe(EXIT_BATCH_REFUSED);
  expect(log.join("\n")).toContain("no batch record");
});

slow("a PR named for a landed branch is attributed in the merge commit, and closed only if GitHub left it open", () => {
  const { work } = fixtures();
  branch(work, "agent/one", "one.txt", "one\n", "one");
  const calls: string[][] = [];
  const gh: Git = (args) => {
    calls.push(args);
    if (args[0] === "pr" && args[1] === "list") {
      return { status: 0, stdout: JSON.stringify([{ number: 2400, title: "One", headRefName: "agent/one" }]), stderr: "" };
    }
    if (args[0] === "pr" && args[1] === "view") return { status: 0, stdout: JSON.stringify({ state: "OPEN" }), stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  const outcome = landBatch(argsFor(["agent/one"]), batchIo(work, [], gh));
  expect(outcome.landed[0]?.pr).toBe(2400);
  expect(gitOk(work, ["log", "-1", "--format=%s", "origin/beta"])).toContain("Merge pull request #2400");
  expect(calls.some((args) => args[1] === "close" && args[2] === "2400")).toBe(true);
  expect(readFileSync(recordPath((args) => gitIn(work, args)), "utf8")).toContain("agent/one");
});

slow("the hand-off names the run the batch started, and asks nothing of the reader that waits", () => {
  const gh: Git = (args) =>
    args[0] === "run"
      ? { status: 0, stdout: JSON.stringify([{ databaseId: 40110539507, headSha: "bbbb" }, { databaseId: 42, headSha: "aaaa" }]), stderr: "" }
      : { status: 1, stdout: "", stderr: "no gh in this test" };
  expect(runOnTip({ gh } as unknown as BatchIo, "beta", "aaaa")).toBe(42);
  expect(runOnTip({ gh } as unknown as BatchIo, "beta", "cccc")).toBeNull();
  expect(handOffLines("aaaaaaaaaaaa", "beta", 42)[0]).toBe("status: gh run view 42 --json status,conclusion");
  expect(handOffLines("aaaaaaaaaaaa", "beta")[0]).toContain("gh run list --branch beta");
  expect(handOffLines("aaaaaaaaaaaa", "beta")[2]).toContain("waits for nothing");
});

slow("a branch the remote never received is skipped, not invented", () => {
  const { work } = fixtures();
  const outcome = landBatch(argsFor(["agent/nowhere"]), batchIo(work));
  expect(outcome.code).toBe(EXIT_BATCH_EMPTY);
  expect(outcome.skipped[0]?.why).toContain("no such branch");
});
