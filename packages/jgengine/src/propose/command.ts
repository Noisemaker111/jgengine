import { existsSync } from "node:fs";
import { join, parse, relative, resolve, sep } from "node:path";

import { engineRepoRoot, loadProposalRules, type ProposalRules } from "./engine";
import { proposalIssue } from "./issue";
import { applyMigration, planMigration } from "./migrate";
import { analyzeProposal, checkFailures, scanProposals, type ProposalReport, type ProposalScan } from "./proposals";
import { nearestPackageDir } from "./source";

export const PROPOSE_USAGE = `usage: jgengine propose [dir] [--issue | --list | --check | --migrate <folder>] [--id <id>] [--json]

An engine proposal is a <feature>.engine.ts file next to the game code: the working shim the game
imports, the spec (its exports under their final names) and the issue body, with a
\`proposal = defineEngineProposal({...})\` export from @jgengine/core/meta/proposal.

  (default) | --issue   print a ready-to-file GitHub issue for each proposal (title + body); it never
                        calls GitHub: you or your agent file it (gh issue create, or the GitHub tools)
  --list                each proposal with its status: local, partial (some exports upstream),
                        upstream (every export resolves at its target: switch imports, delete the file)
  --check               fail on invalid metadata, imports that would not lift into the engine, TODOs,
                        an upstream proposal still in the game, or one id carried by two games
  --migrate <folder>    turn an engine-local/<name>/ folder into proposal form: writes
                        <name>.engine.ts (TODO fields to fill) and moves the game's imports onto it
  --id <id>             only this proposal
  --json                machine-readable output

dir defaults to the current folder (games/ at the engine repository root).`;

interface ProposeArgs {
  mode: "issue" | "list" | "check" | "migrate";
  dir: string | null;
  migrate: string | null;
  id: string | null;
  json: boolean;
}

function parseArgs(argv: readonly string[]): ProposeArgs | string {
  const args: ProposeArgs = { mode: "issue", dir: null, migrate: null, id: null, json: false };
  const modes = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--list") modes.add("list");
    else if (arg === "--issue") modes.add("issue");
    else if (arg === "--check") modes.add("check");
    else if (arg === "--json") args.json = true;
    else if (arg === "--migrate" || arg === "--id") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("-")) return `${arg} needs a value`;
      i += 1;
      if (arg === "--migrate") {
        modes.add("migrate");
        args.migrate = value;
      } else args.id = value;
    } else if (arg.startsWith("-")) return `unknown option ${arg}`;
    else if (args.dir === null) args.dir = arg;
    else return `unexpected argument ${arg}`;
  }
  if (modes.size > 1) return `pick one of ${[...modes].map((mode) => `--${mode}`).join(", ")}`;
  args.mode = ([...modes][0] as ProposeArgs["mode"] | undefined) ?? "issue";
  return args;
}

/** The folder a scan starts at: the one named, else the current folder, or its `games/` at the engine repository root. */
export function proposeRoot(dir: string | null, cwd: string): string {
  if (dir !== null) return resolve(cwd, dir);
  return engineRepoRoot(cwd) === cwd && existsSync(join(cwd, "games")) ? join(cwd, "games") : cwd;
}

function posix(path: string): string {
  return path.split(sep).join("/");
}

function summary(report: ProposalReport, root: string) {
  const raw = (typeof report.raw === "object" && report.raw !== null ? report.raw : {}) as Record<string, unknown>;
  return {
    id: raw["id"] ?? null,
    path: report.path,
    game: report.game,
    target: raw["target"] ?? null,
    kind: raw["kind"] ?? null,
    exports: raw["exports"] ?? null,
    status: report.status,
    upstreamExports: report.upstreamExports,
    missingExports: report.missingExports,
    importers: report.importers.map((file) => posix(relative(root, file))),
    errors: report.errors,
  };
}

function renderList(scan: ProposalScan): string {
  if (scan.proposals.length === 0) return `no engine proposals (*.engine.ts) under ${scan.root}`;
  const lines = scan.proposals.map((report) => {
    const raw = (typeof report.raw === "object" && report.raw !== null ? report.raw : {}) as Record<string, unknown>;
    const status = report.status === "partial" ? `partial (missing ${report.missingExports.join(", ")})` : report.status;
    const problems = report.errors.length > 0 ? `  [${report.errors.length} problem${report.errors.length === 1 ? "" : "s"}]` : "";
    return `${String(raw["id"] ?? "(no id)")}  ${status}  ${String(raw["kind"] ?? "?")} → ${String(raw["target"] ?? "?")}  ${report.path}${problems}`;
  });
  return lines.join("\n");
}

/** `jgengine propose`. */
export async function runPropose(argv: readonly string[], cwd: string = process.cwd()): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(PROPOSE_USAGE);
    return 0;
  }
  const args = parseArgs(argv);
  if (typeof args === "string") {
    console.error(`error: ${args}\n${PROPOSE_USAGE}`);
    return 1;
  }
  const root = proposeRoot(args.dir, cwd);
  if (!existsSync(root)) {
    console.error(`error: folder not found: ${root}`);
    return 1;
  }
  const rules = await loadProposalRules(root);
  if (rules === null) {
    console.error("error: @jgengine/core/meta/proposal is not installed here; proposals import defineEngineProposal from it (install @jgengine/core)");
    return 1;
  }

  if (args.mode === "migrate") return migrate(resolve(cwd, args.migrate!), rules, args.json);

  const scan = scanProposals(root, rules);
  const proposals = args.id === null ? scan.proposals : scan.proposals.filter((report) => (report.raw as { id?: unknown } | null)?.id === args.id);
  if (args.id !== null && proposals.length === 0) {
    console.error(`error: no proposal with id ${args.id} under ${root}`);
    return 1;
  }
  const scoped: ProposalScan = { ...scan, proposals };

  if (args.mode === "check") {
    const failures = checkFailures(scoped);
    if (args.json) console.log(JSON.stringify({ ok: failures.length === 0, failures, proposals: proposals.map((report) => summary(report, root)) }, null, 2));
    else if (failures.length === 0) console.log(`engine proposals: ${proposals.length} ok under ${posix(relative(cwd, root)) || "."}`);
    else console.error(`engine proposals: ${failures.length} problem${failures.length === 1 ? "" : "s"}\n${failures.map((failure) => `  - ${failure}`).join("\n")}`);
    return failures.length === 0 ? 0 : 1;
  }
  if (args.mode === "list") {
    console.log(args.json ? JSON.stringify(proposals.map((report) => summary(report, root)), null, 2) : renderList(scoped));
    return 0;
  }
  const issues = proposals.map((report) => ({ ...proposalIssue(report, root), status: report.status, path: report.path, errors: report.errors }));
  if (args.json) {
    console.log(JSON.stringify(issues, null, 2));
    return 0;
  }
  if (issues.length === 0) {
    console.log(`no engine proposals (*.engine.ts) under ${root}`);
    return 0;
  }
  console.log(issues.map((issue) => `Title: ${issue.title}\n\n${issue.body}`).join("\n---\n\n"));
  console.error(`\n${issues.length} issue${issues.length === 1 ? "" : "s"} printed; file each (gh issue create --title "<title>" --body-file <file>, or your agent's GitHub tools).`);
  for (const issue of issues) if (issue.errors.length > 0) console.error(`warning: ${issue.path} has ${issue.errors.length} open problem(s); \`jgengine propose --check\` lists them`);
  return 0;
}

function migrate(dir: string, rules: ProposalRules, json: boolean): number {
  let plan;
  try {
    plan = planMigration(dir);
  } catch (error) {
    console.error(`error: ${(error as Error).message}`);
    return 1;
  }
  applyMigration(plan);
  const gameDir = nearestPackageDir(dir, parse(dir).root);
  const reports = plan.writes.map((write) => analyzeProposal(write.path, gameDir, rules, new Map(), gameDir));
  const open = reports.flatMap((report) => report.errors.map((error) => `${report.path}: ${error}`));
  if (json) {
    console.log(JSON.stringify({ created: plan.writes.map((write) => write.path), rewrites: plan.rewrites, notes: plan.notes, problems: open }, null, 2));
    return 0;
  }
  for (const write of plan.writes) console.log(`created ${posix(relative(gameDir, write.path))}`);
  for (const rewrite of plan.rewrites) console.log(`  ${posix(relative(gameDir, rewrite.file))}: "${rewrite.from}" → "${rewrite.to}"`);
  for (const note of plan.notes) console.log(`note: ${note}`);
  if (open.length > 0) console.log(`\nstill to do before filing:\n${open.map((problem) => `  - ${problem}`).join("\n")}`);
  console.log("\nthen: jgengine propose --check, and jgengine propose to print the issue");
  return 0;
}
