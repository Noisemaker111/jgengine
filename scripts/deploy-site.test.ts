import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { deploySite, deploySteps, publishThenDeploy, siteWorktreePath, type DeployResult, type RunStep } from "./deploy-site";

const scratch = join(import.meta.dir, "../.scratch");
mkdirSync(scratch, { recursive: true });

test("a release publishes first, then deploys the site", async () => {
  const order: string[] = [];
  const code = await publishThenDeploy(
    async () => {
      order.push("publish");
      return { code: 0, line: "published" };
    },
    () => {
      order.push("deploy");
      return { ok: true, line: "deployed" };
    },
    () => {},
  );
  expect(order).toEqual(["publish", "deploy"]);
  expect(code).toBe(0);
});

test("a failed publish never deploys", async () => {
  let deployed = false;
  const lines: string[] = [];
  const code = await publishThenDeploy(
    async () => ({ code: 1, line: "publish failed" }),
    (): DeployResult => {
      deployed = true;
      return { ok: true, line: "" };
    },
    (line) => lines.push(line),
  );
  expect(deployed).toBe(false);
  expect(code).toBe(1);
  expect(lines.join("\n")).toContain("not deployed");
});

test("a failed deploy fails the release with its reason", async () => {
  const code = await publishThenDeploy(
    async () => ({ code: 0, line: "published" }),
    () => ({ ok: false, line: "deploy:site FAILED" }),
    () => {},
  );
  expect(code).toBe(1);
});

test("the site worktree is named by commit under the main checkout's worktrees", () => {
  const mainRoot = join("proofs", "repo");
  expect(siteWorktreePath(mainRoot, "abcdef1234567")).toBe(join(mainRoot, ".claude", "worktrees", "site-deploy-abcdef123"));
  expect(deploySteps().map((step) => step.join(" "))).toEqual([
    "bun scripts/ensure-ready.ts --install-only",
    "bun run games:provision",
    "bun --cwd=apps/web run deploy:cloudflare",
  ]);
});

const git = (cwd: string, args: string[]) =>
  spawnSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    timeout: 60_000,
  });

/** A main checkout with one released commit, and a linked release folder whose files were emptied after the merge. */
function releaseRepo() {
  const dir = mkdtempSync(join(scratch, "deploy-site-"));
  const main = join(dir, "main");
  mkdirSync(join(main, "apps", "web"), { recursive: true });
  writeFileSync(join(main, "apps", "web", "package.json"), "{}\n");
  git(main, ["init", "-q", "-b", "beta"]);
  git(main, ["add", "-A"]);
  git(main, ["commit", "-q", "-m", "release"]);
  const sha = git(main, ["rev-parse", "HEAD"]).stdout.trim();
  const release = join(dir, "release");
  git(main, ["worktree", "add", "-q", "--detach", release, sha]);
  rmSync(join(release, "apps"), { recursive: true, force: true });
  return { dir, main, release, sha };
}

/** Real git for git steps; deploy steps are recorded with the cwd they ran in, and never spawn anything. */
function recordingRun(exitFor: (command: readonly string[]) => number = () => 0) {
  const steps: { command: string; cwd: string; sawBuildSource: boolean }[] = [];
  const run: RunStep = (command, cwd) => {
    if (command[0] === "git") {
      const out = spawnSync("git", command.slice(1), { cwd, encoding: "utf8", timeout: 60_000 });
      return { status: out.status ?? 1, tail: out.stderr ?? "", stdout: out.stdout ?? "" };
    }
    steps.push({ command: command.join(" "), cwd, sawBuildSource: existsSync(join(cwd, "apps", "web", "package.json")) });
    return { status: exitFor(command), tail: exitFor(command) === 0 ? "" : "wrangler: not authenticated", stdout: "" };
  };
  return { run, steps };
}

test("the site builds in its own worktree at the released commit, though the release folder is emptied", () => {
  const repo = releaseRepo();
  try {
    const { run, steps } = recordingRun();
    const result = deploySite(repo.release, run, repo.sha);

    expect(result.ok).toBe(true);
    expect(result.line).toContain(repo.sha.slice(0, 9));
    expect(steps.map((step) => step.command)).toEqual([
      "bun scripts/ensure-ready.ts --install-only",
      "bun run games:provision",
      "bun --cwd=apps/web run deploy:cloudflare",
    ]);
    for (const step of steps) {
      expect(step.cwd).not.toBe(repo.release);
      expect(step.cwd).toContain(`site-deploy-${repo.sha.slice(0, 9)}`);
      expect(step.sawBuildSource).toBe(true);
    }
    expect(existsSync(steps[0]!.cwd)).toBe(false);
    expect(git(repo.main, ["worktree", "list", "--porcelain"]).stdout).not.toContain("site-deploy-");
    expect(existsSync(join(repo.main, "apps", "web", "package.json"))).toBe(true);
  } finally {
    rmSync(repo.dir, { recursive: true, force: true });
  }
});

test("a failed build stops at that step, names it, and still removes its worktree", () => {
  const repo = releaseRepo();
  try {
    const { run, steps } = recordingRun((command) => (command.includes("deploy:cloudflare") ? 1 : 0));
    const result = deploySite(repo.release, run, repo.sha);

    expect(result.ok).toBe(false);
    expect(result.line).toContain("deploy:cloudflare");
    expect(result.line).toContain("wrangler: not authenticated");
    expect(steps).toHaveLength(3);
    expect(existsSync(steps[0]!.cwd)).toBe(false);
    expect(git(repo.main, ["worktree", "list", "--porcelain"]).stdout).not.toContain("site-deploy-");

    const early = recordingRun((command) => (command[0] === "bun" && command[1] === "scripts/ensure-ready.ts" ? 2 : 0));
    deploySite(repo.release, early.run, repo.sha);
    expect(early.steps.map((step) => step.command)).toEqual(["bun scripts/ensure-ready.ts --install-only"]);
  } finally {
    rmSync(repo.dir, { recursive: true, force: true });
  }
});
