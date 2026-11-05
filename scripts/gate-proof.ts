// A check that cannot fail is not a check. This breaks the product on purpose with a known real
// regression (a weighted pick that ignores its weights; a core model file that pulls in three.js),
// runs the gate a lane relies on, requires it to go red naming the file and the rerun, then restores
// the tree. Run it when a gate's output or selection changed, or before trusting a green you did not
// see fail. Each case's output lands in `.scratch/gate-proof/<case>.log`.
//
//   bun scripts/gate-proof.ts                 # every case (bun run test takes several minutes: start it in the background)
//   bun scripts/gate-proof.ts verify-fast     # the cases of one gate: verify-fast, check, test
//   bun scripts/gate-proof.ts --list
//
// The patches live in scripts/fixtures/gate-proof/. If the tree is left patched (the run was killed),
// `git apply -R scripts/fixtures/gate-proof/<patch>` restores it.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { writeStepLog } from "./failure-digest";
import { printHelpIfAsked, type Usage } from "./script-help";

const root = fileURLToPath(new URL("..", import.meta.url));
const FIXTURES = "scripts/fixtures/gate-proof";

export interface ProofCase {
  name: string;
  /** The gate under proof, as a lane names it. */
  gate: "verify-fast" | "check" | "test";
  /** The regression: a patch under `scripts/fixtures/gate-proof/`. */
  patch: string;
  /** What the regression is, in plain words. */
  breaks: string;
  command: string[];
  /** Every one must appear in the gate's output for the red to count as useful. */
  expect: RegExp[];
  /** Seconds the gate gets. */
  timeoutSeconds: number;
}

export const CASES: readonly ProofCase[] = [
  {
    name: "verify-fast-weighted-pick",
    gate: "verify-fast",
    patch: "weighted-pick-ignores-weights.patch",
    breaks: "pickWeighted gives every item the same share, so loot tables and spawn odds stop honouring their weights",
    command: ["bun", "run", "verify:fast"],
    expect: [/^FAIL {2}test /m, /packages\/core\/src\/random\/pick\.test\.ts: \(fail\) respects weight proportions/, /rerun only this: bun test .*pick\.test\.ts/, /^failed: test /m],
    timeoutSeconds: 540,
  },
  {
    name: "check-layers-three-in-model",
    gate: "check",
    patch: "card-pile-imports-three.patch",
    breaks: "a core model file imports three.js, so the engine's core layer depends on rendering",
    command: ["bun", "run", "check", "layers"],
    expect: [/packages\/core\/src\/cards\/cardPile\.ts/, /three/],
    timeoutSeconds: 120,
  },
  {
    name: "test-weighted-pick",
    gate: "test",
    patch: "weighted-pick-ignores-weights.patch",
    breaks: "the same weighted pick regression, through the whole suite",
    command: ["bun", "run", "test"],
    expect: [/^test: failed$/m, /packages\/core\/src\/random\/pick\.test\.ts: \(fail\) respects weight proportions/, /rerun only these: bun test .*pick\.test\.ts/, /full log \(UTF-8\)/],
    timeoutSeconds: 600,
  },
];

export interface Verdict {
  ok: boolean;
  /** Why the proof failed: the gate stayed green, or went red without the lines a lane needs. */
  reason?: string;
}

/** Red, and every expected line present: the gate caught the break and said what to do. */
export function judge(exitCode: number | null, output: string, expect: readonly RegExp[]): Verdict {
  if (exitCode === 0) return { ok: false, reason: "the gate stayed green on a real break" };
  const missing = expect.filter((pattern) => !pattern.test(output));
  if (missing.length > 0) return { ok: false, reason: `red, but the output lacks: ${missing.map((pattern) => String(pattern)).join(", ")}` };
  return { ok: true };
}

/** The files a patch touches, from its `+++ b/` lines. */
export function patchedFiles(patch: string): string[] {
  return [...patch.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((match) => match[1] ?? "").filter((path) => path.length > 0);
}

function git(args: string[]): { status: number; out: string } {
  const run = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return { status: run.status ?? 1, out: `${run.stdout ?? ""}${run.stderr ?? ""}` };
}

function runCase(proof: ProofCase): boolean {
  const patchPath = join(FIXTURES, proof.patch);
  const files = patchedFiles(readFileSync(join(root, patchPath), "utf8"));
  const dirty = git(["status", "--porcelain", "--", ...files]).out.trim();
  if (dirty.length > 0) {
    console.log(`SKIP  ${proof.name}: ${files.join(", ")} already has local changes; commit or restore them first`);
    return false;
  }
  const applied = git(["apply", patchPath]);
  if (applied.status !== 0) {
    console.log(`FAIL  ${proof.name}: the patch no longer applies to ${files.join(", ")}; update ${patchPath}\n${applied.out}`);
    return false;
  }
  console.log(`${proof.name}: broke ${files.join(", ")} (${proof.breaks}); running ${proof.command.join(" ")}  (restore if this is killed: git apply -R ${patchPath})`);
  let verdict: Verdict;
  let log = "";
  const started = Date.now();
  try {
    const run = spawnSync(proof.command[0] ?? "bun", proof.command.slice(1), { cwd: root, encoding: "utf8", timeout: proof.timeoutSeconds * 1000, maxBuffer: 64 * 1024 * 1024 });
    const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
    log = writeStepLog(root, "gate-proof", proof.name, output);
    verdict = run.error !== undefined ? { ok: false, reason: `the gate did not finish: ${run.error.message}` } : judge(run.status, output, proof.expect);
  } finally {
    const restored = git(["apply", "-R", patchPath]);
    if (restored.status !== 0) console.error(`gate-proof: could not restore ${files.join(", ")}: ${restored.out}`);
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  if (verdict.ok) console.log(`PASS  ${proof.name}: ${proof.gate} went red and named the file and the rerun  (${seconds}s, log ${log.slice(root.length).replaceAll("\\", "/")})`);
  else console.log(`FAIL  ${proof.name}: ${verdict.reason}  (${seconds}s, log ${log.slice(root.length).replaceAll("\\", "/")})`);
  return verdict.ok;
}

const USAGE: Usage = {
  summary: "break the product on purpose and require each gate to go red with a useful message, then restore",
  usage: "bun scripts/gate-proof.ts [verify-fast|check|test|<case>...] [--list]",
  flags: [
    { flag: "<gate|case>...", detail: "only these gates' cases, or these cases by name (default: every case)" },
    { flag: "--list", detail: "print the cases, what each breaks and what it expects, then exit" },
  ],
  example: "bun scripts/gate-proof.ts verify-fast check",
  exits: ["0 every case went red with its expected lines", "1 a gate stayed green, went red without them, or a case was skipped"],
};

function main(argv: readonly string[]): number {
  if (printHelpIfAsked("gate-proof", USAGE, argv)) return 0;
  if (argv.includes("--list")) {
    for (const proof of CASES) console.log(`${proof.name.padEnd(30)} ${proof.gate.padEnd(12)} ${proof.command.join(" ").padEnd(26)} breaks: ${proof.breaks}`);
    return 0;
  }
  const chosen = argv.length === 0 ? CASES : CASES.filter((proof) => argv.includes(proof.gate) || argv.includes(proof.name));
  const unknown = argv.filter((arg) => !CASES.some((proof) => proof.gate === arg || proof.name === arg));
  if (unknown.length > 0 || chosen.length === 0) {
    console.error(`gate-proof: no case or gate named ${unknown.join(", ") || argv.join(", ")} (--list)`);
    return 2;
  }
  const results = chosen.map((proof) => runCase(proof));
  const failed = results.filter((ok) => !ok).length;
  console.log(failed === 0 ? `gate-proof: ${results.length} case(s) went red with a useful message` : `gate-proof: ${failed} of ${results.length} case(s) did not prove its gate`);
  return failed === 0 ? 0 : 1;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
