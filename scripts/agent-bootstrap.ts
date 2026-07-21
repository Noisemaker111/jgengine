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
import { existsSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type PackageStaleness, scanStalePackages } from "./distStaleness";

const root = process.cwd();
const checkOnly = process.argv.includes("--check");
const lockPath = join(root, ".agent-bootstrap.lock");
const logPath = join(root, ".agent-bootstrap.log");
// Present while `bun install` runs; still present on the next run = the install
// was killed mid-flight and node_modules must be wiped (half-hardlinked trees
// corrupt the next install).
const installingPath = join(root, ".agent-bootstrap.installing");

function hasTsgo(): boolean {
  return existsSync(join(root, "node_modules", ".bin", "tsgo"))
    || existsSync(join(root, "node_modules", ".bin", "tsgo.exe"));
}

function hasCoreDist(): boolean {
  return existsSync(join(root, "packages", "core", "dist"));
}

function describeStale(list: PackageStaleness[]): string {
  return list.map(({ pkg, staleness }) => `  - ${pkg}: ${staleness.kind} — ${staleness.detail}`).join("\n");
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

function lockAlive(): boolean {
  try {
    const ageMs = Date.now() - statSync(lockPath).mtimeMs;
    if (ageMs > 25 * 60_000) return false; // stale — a bootstrap never takes this long
    const pid = Number(readFileSync(lockPath, "utf8").trim());
    if (!Number.isFinite(pid) || pid <= 0) return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Never race two installs — a second bootstrap waits for the running one. */
function joinOrAcquireLock(): void {
  while (lockAlive()) {
    console.log("agent-bootstrap: another bootstrap is running — waiting for it (do NOT kill it)");
    Bun.sleepSync(5_000);
    if (!lockAlive() && hasTsgo() && hasCoreDist()) {
      console.log("agent-bootstrap: the other bootstrap finished — tree is ready");
      process.exit(0);
    }
  }
  try {
    rmSync(lockPath, { force: true });
  } catch {}
  writeFileSync(lockPath, String(process.pid));
}

function releaseLock(): void {
  try {
    unlinkSync(lockPath);
  } catch {}
}

function printContract(): void {
  console.log(`
agent-bootstrap: ready

Package scripts (preferred):
  bun --cwd packages/<pkg> run <script>
Avoid:
  bun run --cwd packages/<pkg> <script>   # can resolve the wrong root script

Worktrees (local machines only):
  bun run agent:worktree -- <name>  →  .claude/worktrees/<name>/ (bootstraps itself)
  Cloud/container sessions are already isolated — never create a worktree there; just branch.

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

// A dist that merely *exists* is not enough: a partial/interrupted build leaves
// core/dist present but missing subpaths (e.g. vfx/screenEffects), and a source
// changed after the last build leaves dist older than src. Only a complete,
// fresh dist for every buildable package counts as ready.
const stale = hasTsgo() && hasCoreDist() ? scanStalePackages(root) : [];
const ready = hasTsgo() && hasCoreDist() && stale.length === 0;
if (checkOnly) {
  if (ready) {
    console.log("agent-bootstrap: check ok (deps present, every package dist complete and fresh)");
    process.exit(0);
  }
  if (hasTsgo() && hasCoreDist() && stale.length > 0) {
    console.error(
      `agent-bootstrap: not ready — ${stale.length} package(s) have stale/incomplete dist:\n${describeStale(stale)}\n` +
        "  run `bun run agent:bootstrap` to rebuild them (do NOT `rm -rf packages/*/dist` by hand).",
    );
    process.exit(1);
  }
  if (lockAlive()) {
    const pid = readFileSync(lockPath, "utf8").trim();
    const elapsed = Math.round((Date.now() - statSync(lockPath).mtimeMs) / 1000);
    let last = "";
    try {
      last = readFileSync(logPath, "utf8").trimEnd().split("\n").filter(Boolean).at(-1) ?? "";
    } catch {}
    console.error(
      `agent-bootstrap: in progress (pid ${pid}, ~${elapsed}s elapsed, whole run ~2-3 min).` +
        (last ? ` last: ${last}` : "") +
        ` Do NOT start another or kill it — wait and re-check.`,
    );
    process.exit(1);
  }
  console.error("agent-bootstrap: not ready — run `bun run agent:bootstrap` (missing node_modules and/or packages/core/dist)");
  process.exit(1);
}

joinOrAcquireLock();
process.on("exit", releaseLock);

if (!hasTsgo() || existsSync(installingPath)) {
  // node_modules present but unusable (or a leftover installing marker) means a
  // previous install was killed mid-flight (SIGKILL leaves half-hardlinked
  // packages that corrupt the next install). Wipe first.
  if (existsSync(join(root, "node_modules"))) {
    console.log("agent-bootstrap: partial node_modules detected (killed install) — wiping before reinstall");
    rmSync(join(root, "node_modules"), { recursive: true, force: true });
  }
  writeFileSync(installingPath, String(process.pid));
  run("bun install --frozen-lockfile", ["bun", "install", "--frozen-lockfile"], 600_000);
  rmSync(installingPath, { force: true });
} else {
  console.log("agent-bootstrap: node_modules present (tsgo found)");
}

// A prior interrupted build can leave a package's dist present but partial
// (missing subpaths) or older than its src. Incremental in-place builds do not
// re-emit those, so downstream check-types/manifest/barrels resolve stale output.
// Remove any stale/incomplete dist first so the build re-emits it cleanly — this
// self-heals a partial build the same way the .installing marker self-heals a
// killed install.
const preStale = scanStalePackages(root);
for (const { pkg, dir, staleness } of preStale) {
  const distDir = join(dir, "dist");
  if (existsSync(distDir)) {
    console.log(`agent-bootstrap: ${pkg} dist ${staleness.kind} (${staleness.detail}) — cleaning for a fresh build`);
    rmSync(distDir, { recursive: true, force: true });
  }
}

// Full workspace build writes dist for package typechecks and clean-consumer tests.
run("bun run build", ["bun", "run", "build"], 900_000);

if (!hasCoreDist()) {
  console.error("agent-bootstrap: packages/core/dist still missing after build");
  process.exit(1);
}

// Postcondition: the build must have produced a complete, fresh dist for every
// package. A non-empty result here means the build did not emit expected outputs
// — surface it loudly instead of leaving downstream checks to trip on stale dist.
const postStale = scanStalePackages(root);
if (postStale.length > 0) {
  console.error(
    `agent-bootstrap: build finished but dist is still stale/incomplete for:\n${describeStale(postStale)}\n` +
      "  the build did not emit expected outputs — investigate before proceeding.",
  );
  process.exit(1);
}

printContract();
