// Deploy jgengine.com. The site build bakes game covers and reads game models, and CI never touches
// models (Jon, 25 Oct), so the deploy runs on this machine: link every game's packs from the shared
// asset store (`games:provision`, downloading only what the store lacks), then build and push the
// Cloudflare worker. `bun run release --wait` runs it after the Publish run succeeds; `bun run
// deploy:site` runs it alone.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { printHelpIfAsked } from "./script-help";

const DEPLOY_SITE_USAGE = {
  summary: "link every game's models from the shared asset store, then build and deploy jgengine.com to Cloudflare",
  usage: "bun run deploy:site",
  example: "bun run deploy:site",
  flags: [],
};

export interface StepResult {
  status: number;
  /** The last output lines, kept for the failure reason. */
  tail: string;
}

export type RunStep = (command: readonly string[], cwd: string) => StepResult;

export interface DeployResult {
  ok: boolean;
  line: string;
}

/** The commands a site deploy runs, in order. `sha` first checks out the released commit. */
export function deploySteps(sha?: string): string[][] {
  return [
    ...(sha === undefined ? [] : [["git", "checkout", "--quiet", "--detach", sha]]),
    ["bun", "run", "games:provision"],
    ["bun", "--cwd=apps/web", "run", "deploy:cloudflare"],
  ];
}

/** Run the deploy steps, stopping at the first failure and naming it with its last output. */
export function deploySite(root: string, run: RunStep, sha?: string): DeployResult {
  for (const step of deploySteps(sha)) {
    const result = run(step, root);
    if (result.status !== 0) {
      const reason = result.tail.trim() === "" ? "" : `\n${result.tail.trim()}`;
      return { ok: false, line: `deploy:site FAILED at \`${step.join(" ")}\` (exit ${result.status}); jgengine.com was not updated${reason}` };
    }
  }
  return { ok: true, line: `deploy:site: jgengine.com deployed${sha === undefined ? "" : ` from ${sha.slice(0, 9)}`}` };
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
  return { status: result.status ?? 1, tail };
};

if (import.meta.main) {
  if (printHelpIfAsked("deploy-site", DEPLOY_SITE_USAGE)) process.exit(0);
  const root = fileURLToPath(new URL("..", import.meta.url));
  const result = deploySite(root, runStep);
  (result.ok ? console.log : console.error)(result.line);
  process.exit(result.ok ? 0 : 1);
}
