// A failing step used to end in its whole output or one count ("290 files failed"), so a
// lane scrolled thousands of lines to find which file broke and why. This reads the output
// of the tools the steps run (bun test, tsgo/tsc, the check-* scripts) and returns one line
// per failing file: where, and the first error it printed. The full output goes to a UTF-8
// log beside it, so nothing is lost.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface FailureLine {
  /** The failing file (with a line when the tool named one), or the step itself. */
  where: string;
  /** The first error line that file produced. */
  first: string;
}

const ANSI = /\u001b\[[0-9;]*m/g;
const TS_ERROR = /^(.+?\.(?:[cm]?[jt]sx?|json|vue))(?:\((\d+),(\d+)\)|:(\d+):(\d+))\s*[:-]\s*error\s+(TS\d+):\s*(.*)$/;
const TEST_HEADER = /^((?:[\w@.-]+[\\/])*[\w@.-]+\.(?:test|spec)\.[cm]?[jt]sx?):$/;
const BUN_FAIL = /^\s*(?:\(fail\)|✗)\s+(.*?)(?:\s+\[[\d.]+m?s\])?$/;
const ERROR_LINE = /^\s*(?:error|Error|TypeError|ReferenceError|SyntaxError|AssertionError)\b[:\s]/;
const GENERIC = /\b(error|fail(?:ed|s|ure)?|cannot|missing|stale|drift(?:ed)?|refus(?:ed|es))\b|✗|×/i;

function clip(text: string, width = 200): string {
  const flat = text.trim().replace(/\s+/g, " ");
  return flat.length > width ? `${flat.slice(0, width - 1)}…` : flat;
}

/** One line per failing file, in the order the output first named them. */
export function failureDigest(output: string): FailureLine[] {
  const lines = output.replace(ANSI, "").split(/\r?\n/);
  const byWhere = new Map<string, string>();
  const note = (where: string, first: string): void => {
    if (!byWhere.has(where)) byWhere.set(where, clip(first));
  };

  let testFile: string | null = null;
  let lastError: string | null = null;
  for (const line of lines) {
    const ts = TS_ERROR.exec(line.trim());
    if (ts !== null) {
      const row = ts[2] ?? ts[4];
      note(`${ts[1]!.replaceAll("\\", "/")}:${row}`, `${ts[6]}: ${ts[7]}`);
      continue;
    }
    const header = TEST_HEADER.exec(line.trim());
    if (header !== null) {
      testFile = header[1]!.replaceAll("\\", "/");
      lastError = null;
      continue;
    }
    if (ERROR_LINE.test(line) && lastError === null) {
      lastError = line.trim();
      continue;
    }
    const failed = BUN_FAIL.exec(line);
    if (failed !== null) {
      const name = failed[1]!.trim();
      note(testFile ?? "(test)", lastError === null ? `(fail) ${name}` : `(fail) ${name} - ${lastError}`);
      lastError = null;
      continue;
    }
    if (/^\s*\(pass\)/.test(line)) lastError = null;
  }

  // A tool this does not know: its first line that reads like a failure.
  if (byWhere.size === 0) {
    const first = lines.find((line) => GENERIC.test(line) && line.trim().length > 0);
    if (first !== undefined) note("(output)", first);
  }
  // Collapse per-line TS keys to one entry per file, keeping the first error.
  const perFile = new Map<string, FailureLine>();
  for (const [where, first] of byWhere) {
    const file = where.replace(/:\d+$/, "");
    if (!perFile.has(file)) perFile.set(file, { where, first });
  }
  return [...perFile.values()];
}

/** The lines a failed step prints: each failing file and its first error, then where the full log is. */
export function digestLines(output: string, logPath: string | null, limit = 30): string[] {
  const digest = failureDigest(output);
  const lines: string[] = [];
  if (digest.length === 0) {
    const tail = output.replace(ANSI, "").split(/\r?\n/).filter((line) => line.trim().length > 0).slice(-15);
    lines.push(...tail.map((line) => `    ${clip(line, 240)}`));
  } else {
    lines.push(`  ${digest.length} failing file(s):`);
    for (const entry of digest.slice(0, limit)) lines.push(`    ${entry.where}: ${entry.first}`);
    if (digest.length > limit) lines.push(`    +${digest.length - limit} more in the log`);
  }
  if (logPath !== null) lines.push(`  full log (UTF-8): ${logPath}`);
  return lines;
}

/** Write a step's whole output as UTF-8 under `.scratch/<group>/`, returning the path. */
export function writeStepLog(root: string, group: string, step: string, output: string): string {
  const dir = join(root, ".scratch", group);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${step.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "")}.log`);
  writeFileSync(path, output.replace(ANSI, ""), { encoding: "utf8" });
  return path;
}
