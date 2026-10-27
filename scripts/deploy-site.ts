// Deploy jgengine.com. The site build bakes game covers and reads game models, and CI never touches
// models (Jon, 25 Oct), so the deploy runs on this machine. It builds in its own worktree at the commit
// being deployed, so the folder a release ran in can be emptied or removed without breaking the deploy.
// That worktree is removed afterwards, pass or fail. `bun run release --wait` runs it after the Publish
// run succeeds; `bun run deploy:site` runs it alone, for HEAD.
import { spawnSync } from "node:child_process";
import { lstatSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { mainCheckoutRoot } from "./agent-worktree";
import { removeNodeModules } from "./worktree-doctor";
import { removeDirSync } from "./removeDir";
import { printHelpIfAsked } from "./script-help";

const DEPLOY_SITE_USAGE = {
  summary: "build jgengine.com in a fresh worktree at HEAD, with the shared asset store linked, and deploy it to Cloudflare",
  usage: "bun run deploy:site",
  example: "bun run deploy:site",
  flags: [],
};

export interface StepResult {
  status: number;
  /** The last output lines, kept for the failure reason. */
  tail: string;
  /** The standard output, for the one step whose answer is needed (a commit id). */
  stdout: string;
}

export type RunStep = (command: readonly string[], cwd: string) => StepResult;

export interface DeployResult {
  ok: boolean;
  line: string;
}

/** The commands a site deploy runs inside its worktree, in order. */
export function deploySteps(): string[][] {
  return [
    ["bun", "scripts/ensure-ready.ts", "--install-only"],
    ["bun", "run", "games:provision"],
    ["bun", "--cwd=apps/web", "run", "deploy:cloudflare"],
  ];
}

/** Where a deploy of `commit` builds: under the main checkout's `.claude/worktrees/`, never nested. */
export function siteWorktreePath(mainRoot: string, commit: string): string {
  return join(mainRoot, ".claude", "worktrees", `site-deploy-${commit.slice(0, 9)}`);
}

/**
 * Deploy `sha` (HEAD when omitted) from a fresh worktree at that commit. The folder the call runs from
 * only names the commit and the main checkout, so a release that emptied its own folder still deploys.
 */
export function deploySite(root: string, run: RunStep, sha?: string): DeployResult {
  const resolved = run(["git", "rev-parse", "--verify", "--quiet", sha ?? "HEAD"], root);
  const commit = resolved.stdout.trim();
  if (resolved.status !== 0 || commit === "") {
    return { ok: false, line: `deploy:site FAILED: cannot resolve ${sha ?? "HEAD"} to a commit; jgengine.com was not updated` };
  }
  const mainRoot = mainCheckoutRoot(root) ?? root;
  const worktree = siteWorktreePath(mainRoot, commit);
  removeSiteWorktree(mainRoot, worktree, run);
  const added = run(["git", "worktree", "add", "--detach", worktree, commit], mainRoot);
  if (added.status !== 0) {
    return { ok: false, line: `deploy:site FAILED at \`git worktree add\` (exit ${added.status}); jgengine.com was not updated${reasonOf(added)}` };
  }

  let outcome: DeployResult;
  let removed = true;
  try {
    outcome = buildAndDeploy(worktree, run, commit);
  } finally {
    removed = removeSiteWorktree(mainRoot, worktree, run);
  }
  return removed ? outcome : { ...outcome, line: `${outcome.line}\ndeploy:site: could not remove ${worktree}; remove it with git worktree remove --force` };
}

function buildAndDeploy(worktree: string, run: RunStep, commit: string): DeployResult {
  for (const step of deploySteps()) {
    const result = run(step, worktree);
    if (result.status !== 0) {
      return { ok: false, line: `deploy:site FAILED at \`${step.join(" ")}\` (exit ${result.status}); jgengine.com was not updated${reasonOf(result)}` };
    }
  }
  return { ok: true, line: `deploy:site: jgengine.com deployed from ${commit.slice(0, 9)}` };
}

function reasonOf(result: StepResult): string {
  return result.tail.trim() === "" ? "" : `\n${result.tail.trim()}`;
}

function lexists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove a deploy's worktree. The root node_modules is a link into the main checkout, so it is unlinked
 * before the recursive delete (as `worktree reap` does), and the git metadata is pruned after.
 */
function removeSiteWorktree(mainRoot: string, worktree: string, run: RunStep): boolean {
  if (lexists(worktree)) {
    if (lexists(join(worktree, "node_modules"))) removeNodeModules(worktree);
    removeDirSync(worktree, 1_000);
  }
  run(["git", "worktree", "prune"], mainRoot);
  return !lexists(worktree);
}

/**
 * Publish, then deploy: the site goes out only after npm has the release, and a failed deploy fails
 * the release with its reason.
 */
export async function publishThenDeploy(
  publish: () => Promise<{ code: number; line: string }>,
  deploy: () => DeployResult,
  log: (line: string) => void = console.log,
): Promise<number> {
  const published = await publish();
  log(published.line);
  if (published.code !== 0) {
    log("release: the site was not deployed because the publish failed");
    return published.code;
  }
  const deployed = deploy();
  log(deployed.line);
  return deployed.ok ? 0 : 1;
}

/** Spawn a step with its output streamed and the tail kept for the failure line. */
export const runStep: RunStep = (command, cwd) => {
  const [exe, ...args] = command;
  const result = spawnSync(exe!, args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, shell: process.platform === "win32" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);
  const tail = (result.error ? String(result.error) : output).trim().split(/\r?\n/).slice(-15).join("\n");
  return { status: result.status ?? 1, tail, stdout: result.stdout ?? "" };
};

if (import.meta.main) {
  if (printHelpIfAsked("deploy-site", DEPLOY_SITE_USAGE)) process.exit(0);
  const root = fileURLToPath(new URL("..", import.meta.url));
  const result = deploySite(root, runStep);
  (result.ok ? console.log : console.error)(result.line);
  process.exit(result.ok ? 0 : 1);
}
