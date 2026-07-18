/**
 * Cold-tree on-ramp for coding agents (Claude / Codex / Grok).
 *
 * Fresh worktrees and clean checkouts lack node_modules and package dist.
 * Package typechecks resolve @jgengine/* through built dist, so install alone
 * is not enough. Run this before focused checks or gate.
 *
 *   bun run agent:bootstrap
 *   bun run agent:bootstrap --check   # report only; exit 1 if not ready
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const checkOnly = process.argv.includes("--check");

function hasTsgo(): boolean {
  return existsSync(join(root, "node_modules", ".bin", "tsgo"))
    || existsSync(join(root, "node_modules", ".bin", "tsgo.exe"));
}

function hasCoreDist(): boolean {
  return existsSync(join(root, "packages", "core", "dist"));
}

function run(label: string, cmd: string[], timeoutMs: number): void {
  console.log(`agent-bootstrap: ${label}`);
  const result = Bun.spawnSync(cmd, {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
    timeout: timeoutMs,
    killSignal: "SIGKILL",
  });
  if (result.exitCode !== 0) {
    const reason = result.signalCode
      ? `killed by ${result.signalCode} (timeout ~${Math.round(timeoutMs / 1000)}s)`
      : `exit ${result.exitCode ?? 1}`;
    console.error(`agent-bootstrap: failed — ${cmd.join(" ")} (${reason})`);
    process.exit(result.exitCode ?? 1);
  }
}

function printContract(): void {
  console.log(`
agent-bootstrap: ready

Package scripts (preferred):
  bun --cwd packages/<pkg> run <script>
Avoid:
  bun run --cwd packages/<pkg> <script>   # can resolve the wrong root script

Worktrees:
  Claude: claude --worktree <name>  →  .claude/worktrees/<name>/  then re-run agent:bootstrap there
  Never: C:\\tmp\\... on Windows Codex elevated sandbox
  Never: nest a worktree under another agent worktree

Verify:
  focused package tests while iterating
  bun run gate before ship; bun run ship:preflight before commit/push
  visual: bun run shoot daemon + shoot <game> only for pixel claims
  arbitrary --url pages must set document.documentElement.dataset.jgCapture = "ready"
`);
}

if (!existsSync(join(root, "package.json")) || !existsSync(join(root, "bun.lock"))) {
  console.error("agent-bootstrap: run from the jgengine monorepo root (package.json + bun.lock required)");
  process.exit(1);
}

const ready = hasTsgo() && hasCoreDist();
if (checkOnly) {
  if (ready) {
    console.log("agent-bootstrap: check ok (deps + core dist present)");
    process.exit(0);
  }
  console.error("agent-bootstrap: not ready — run `bun run agent:bootstrap` (missing node_modules and/or packages/core/dist)");
  process.exit(1);
}

if (!hasTsgo()) {
  run("bun install --frozen-lockfile", ["bun", "install", "--frozen-lockfile"], 600_000);
} else {
  console.log("agent-bootstrap: node_modules present (tsgo found)");
}

// Full workspace build writes dist for package typechecks and clean-consumer tests.
run("bun run build", ["bun", "run", "build"], 900_000);

if (!hasCoreDist()) {
  console.error("agent-bootstrap: packages/core/dist still missing after build");
  process.exit(1);
}

printContract();
