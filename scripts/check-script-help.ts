// A lane that asks `bun run <script> --help` must get an answer, and the answer must
// be the truth about that script: a name it guessed, or a script that never got a
// usage block, is invisible until the guess fails inside someone's transcript.
//
// This walks every package.json script that names a file in `scripts/`, proves the
// file answers `--help` with a usage block and exit 0 inside its own timeout, and
// fails on the two silent cases: a script the package names but the repo no longer
// has, and a script with no usage block that no one has recorded yet.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { printHelpIfAsked } from "./script-help";

export const EXIT_PASS = 0;
export const EXIT_FAIL = 1;

/** Programs that run another command as their argument: `--help` cannot reach the inner one. */
const WRAPPERS = new Set(["guard.ts", "ensure-ready.ts", "agent-bootstrap.ts"]);
const SCRIPT_FILE = /scripts\/([A-Za-z0-9_./-]+\.(?:ts|mjs|js))/g;
const BASELINE = "scripts/script-help-baseline.json";
const DEFAULT_TIMEOUT_MS = 20_000;

export interface ProbeResult {
  file: string;
  scripts: string[];
  outcome: "pass" | "fail" | "reported";
  detail: string;
  ms: number;
}

export interface Audit {
  ok: boolean;
  probes: ProbeResult[];
  /** Package scripts whose target file does not exist. */
  missing: string[];
  failures: string[];
  /** Undocumented files this run found (baseline or new). */
  undocumented: string[];
  /** Baseline entries that now answer `--help`, so the list can shrink. */
  stale: string[];
}

export interface AuditOptions {
  root: string;
  baseline?: string[];
  timeoutMs?: number;
  /** Test seam: replaces `bun <file> --help`. */
  run?: (file: string) => { status: number | null; stdout: string; stderr: string; ms: number };
}

interface Target {
  file: string;
  scripts: string[];
}

/** Every `scripts/…` file a command names, in the order it names them. */
export function scriptFilesIn(command: string): string[] {
  const found: string[] = [];
  for (const match of command.matchAll(SCRIPT_FILE)) {
    const file = match[1];
    if (file !== undefined && !found.includes(file)) found.push(file);
  }
  return found;
}

/** The file whose `--help` a lane would actually reach: the inner command, never the wrapper. */
export function targetFile(command: string): string | null {
  const files = scriptFilesIn(command);
  if (files.length === 0) return null;
  const inner = files.filter((file) => !WRAPPERS.has(basename(file)));
  return inner[0] ?? files[0] ?? null;
}

export function targets(packageJson: { scripts?: Record<string, string> }): Target[] {
  const byFile = new Map<string, Target>();
  for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
    const file = targetFile(command);
    if (file === null) continue;
    const target = byFile.get(file) ?? { file, scripts: [] };
    target.scripts.push(name);
    byFile.set(file, target);
  }
  return [...byFile.values()].sort((a, b) => a.file.localeCompare(b.file));
}

/** A file declares help when it calls the shared helper or handles `--help` itself. */
export function declaresHelp(source: string): boolean {
  return source.includes("printHelpIfAsked(") || /["']--help["']/.test(source);
}


export function audit(options: AuditOptions): Audit {
  const root = resolve(options.root);
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const baseline = new Set(options.baseline ?? readBaseline(root));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const run =
    options.run ??
    ((file: string) => {
      const started = Date.now();
      const result = spawnSync(process.execPath, [join(root, "scripts", file), "--help"], {
        cwd: root,
        encoding: "utf8",
        timeout: timeoutMs,
        env: { ...process.env, NO_COLOR: "1" },
      });
      return {
        status: result.status,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        ms: Date.now() - started,
      };
    });

  const probes: ProbeResult[] = [];
  const failures: string[] = [];
  const missing: string[] = [];
  const undocumented: string[] = [];
  const stale: string[] = [];

  for (const target of targets(packageJson)) {
    const path = join(root, "scripts", target.file);
    if (!existsSync(path)) {
      missing.push(target.file);
      failures.push(`${target.file}: named by ${target.scripts.join(", ")} but not in scripts/`);
      continue;
    }
    const source = readFileSync(path, "utf8");
    const recorded = baseline.has(target.file);
    if (!declaresHelp(source)) {
      undocumented.push(target.file);
      if (!recorded) {
        failures.push(
          `${target.file}: no usage block - add printHelpIfAsked("${basename(target.file, ".ts")}", {...}) from scripts/script-help.ts`,
        );
      }
      probes.push({
        file: target.file,
        scripts: target.scripts,
        outcome: recorded ? "reported" : "fail",
        detail: "no usage block",
        ms: 0,
      });
      continue;
    }
    const result = run(target.file);
    const name = basename(target.file).replace(/\.(ts|mjs|js)$/, "");
    const normalized = result.stdout.toLowerCase().replace(/[:-]/g, "-");
    const answered =
      result.status === 0 && result.stdout.trim().length > 0 && normalized.includes(name.toLowerCase().replace(/[:-]/g, "-"));
    const detail = answered
      ? ""
      : result.status === 0
        ? `printed no usage block for ${name}`
        : result.status === null
          ? `did not exit within ${timeoutMs / 1000}s`
          : `exited ${result.status}`;
    if (!answered) {
      if (!recorded) {
        failures.push(
          `${target.file}: --help failed - ${detail}${result.stderr.trim().length > 0 ? ` (${firstLine(result.stderr)})` : ""}`,
        );
      }
    }
    probes.push({
      file: target.file,
      scripts: target.scripts,
      outcome: answered ? "pass" : recorded ? "reported" : "fail",
      detail,
      ms: result.ms,
    });
  }

  for (const entry of baseline) {
    const probe = probes.find((candidate) => candidate.file === entry);
    if (probe === undefined || probe.outcome === "pass") stale.push(entry);
  }

  return { ok: failures.length === 0, probes, missing, failures, undocumented, stale };
}

function firstLine(text: string): string {
  return text.trim().split(/\r?\n/)[0] ?? "";
}

export function formatAudit(result: Audit, packageScriptCount: number): string {
  const lines = [
    `check:script-help: ${packageScriptCount} package script(s) -> ${result.probes.length + result.missing.length} script file(s)`,
  ];
  for (const probe of result.probes) {
    const mark = probe.outcome === "pass" ? "PASS" : probe.outcome === "reported" ? "TODO" : "FAIL";
    const timing = probe.ms > 0 ? ` ${(probe.ms / 1000).toFixed(1)}s` : "";
    lines.push(`  ${mark}  scripts/${probe.file}  (${probe.scripts.join(", ")})${timing}${probe.detail.length > 0 ? ` - ${probe.detail}` : ""}`);
  }
  for (const file of result.missing) lines.push(`  FAIL  scripts/${file}  - named by package.json, absent from scripts/`);
  const known = result.undocumented.length;
  if (known > 0) {
    lines.push(
      "",
      `${known} script file(s) still have no --help (${BASELINE}); they pass until someone adds a usage block, and any new one fails.`,
    );
    lines.push(`  ${result.undocumented.join(" ")}`);
  }
  if (result.stale.length > 0) {
    lines.push("", `Prune these from ${BASELINE}, they answer --help now: ${result.stale.join(" ")}`);
  }
  if (result.ok) lines.push("", "check:script-help: PASS");
  else lines.push("", ...result.failures.map((line) => `check:script-help: FAIL ${line}`));
  return lines.join("\n");
}

function readBaseline(root: string): string[] {
  const path = join(root, BASELINE);
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { undocumented?: string[] };
  return parsed.undocumented ?? [];
}

const USAGE = {
  summary: "prove every package.json script that points into scripts/ answers `--help`",
  usage: "bun run check:script-help [--json] [--root <dir>] [--write-baseline]",
  flags: [
    { flag: "--json", detail: "print the audit as one document on stdout" },
    { flag: "--root <dir>", detail: "audit another checkout (default: this one)" },
    {
      flag: "--write-baseline",
      detail: `record today's undocumented script files in ${BASELINE}; fails are still fails`,
    },
  ],
  example: "bun run check:script-help --json",
  exits: ["0 every documented script answers --help and nothing new is undocumented", "1 a help probe failed, a named script is missing, or a script has no usage block and is not recorded"],
} as const;

function main(argv: readonly string[]): number {
  if (printHelpIfAsked("check-script-help", USAGE, argv)) return EXIT_PASS;
  const root = value(argv, argv.indexOf("--root") >= 0 ? argv[argv.indexOf("--root") + 1] : undefined) ?? process.cwd();
  const packageJson = JSON.parse(readFileSync(join(resolve(root), "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const result = audit({ root, baseline: readBaseline(resolve(root)) });
  if (argv.includes("--write-baseline")) {
    const recorded = [...new Set([...readBaseline(resolve(root)), ...result.probes.filter((probe) => probe.outcome !== "pass").map((probe) => probe.file)])].sort();
    writeFileSync(
      join(resolve(root), BASELINE),
      `${JSON.stringify(
        {
          why: "Script files that predate `--help`. Each needs printHelpIfAsked(...) from scripts/script-help.ts; a new script file without one fails check:script-help.",
          undocumented: recorded,
        },
        null,
        2,
      )}\n`,
    );
  }
  console.log(
    argv.includes("--json")
      ? JSON.stringify(result, null, 2)
      : formatAudit(result, Object.keys(packageJson.scripts ?? {}).length),
  );
  return result.ok ? EXIT_PASS : EXIT_FAIL;
}

function value(argv: readonly string[], found: string | undefined): string | undefined {
  return found === undefined || found.startsWith("--") ? undefined : found;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
