/**
 * A test that bakes in a path separator passes on the operating system it was written on and fails on
 * the other one, so the red lands on the Linux runner minutes after a push instead of on the machine
 * that can fix it in one line (#2301: `toContain("proofs\\flows")`, and `agent-worktree.test.ts`
 * asserting `"packages/shell/node_modules"` and `readlinkSync(...)` as POSIX strings).
 *
 * A path assertion must be built the way the code builds it: `join(...)` or `sep` on both sides, or a
 * comparison against the same value the implementation returns. Existing offenders carry no baseline;
 * they are fixed. A test that is genuinely Windows-only (a Windows command line, a drive path the
 * function under test consumes) or genuinely POSIX-only (a git path, which is always `/`) is named in
 * `scripts/path-portability-allow.json` with a reason, and that list is printed on every run.
 *
 *   bun run check:path-portability
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { printHelpIfAsked, type Usage } from "./script-help";

const ROOTS = ["scripts", "packages"];
const SELF = "check-path-portability.test.ts";
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage", "Games", ".scratch"]);
const ALLOW_REL = "scripts/path-portability-allow.json";

/** What the assertion is compared against, and where the separator comes from. */
const ASSERTION = /\.(?:toContainEqual|toStrictEqual|toContain|toEqual|toBe|toThrow|toMatch)\b|\b(?:includes|endsWith|startsWith)\(/;
/** `join("/repo", ...)` and `resolve("/repo", ...)`: a leading `/` is not a root on Windows. */
const ROOTING_CALL = /\b(?:join|resolve)\(\s*["'`]\//;
/** Bare separator comparisons: the separator is the whole expected value. */
const BARE_SEPARATOR = /\.(?:toContain|toEqual|toBe|endsWith|startsWith)\(\s*["'](?:\\+|\/)["']\s*\)/;
/**
 * A call whose result carries the running platform's separator, in the same assertion: a literal on
 * the other side of that comparison has to be built the same way. `join(...)` is not here because
 * arrays use it too (`messages.join("\n")`), which says nothing about paths.
 */
const OS_PATH_RESULT = /\b(?:readlinkSync|readlink|realpathSync|realpath|dirname|basename|relative)\(/;

export interface PathHit {
  /** 1-based line of the offending literal. */
  line: number;
  rule: string;
  text: string;
  fix: string;
}

interface Literal {
  /** Source text inside the quotes, escapes intact. */
  raw: string;
  line: number;
}

/** Every quoted string in `source`, by line: regex literals and comments are left alone. */
function literalsOf(source: string): Literal[] {
  const found: Literal[] = [];
  const lines = source.split("\n");
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
    const pattern = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\$]|\\.)*)`/g;
    let match = pattern.exec(line);
    while (match !== null) {
      found.push({ raw: match[1] ?? match[2] ?? match[3] ?? "", line: index + 1 });
      match = pattern.exec(line);
    }
  });
  return found;
}

/**
 * True when the literal spells a Windows path: a doubled backslash (one literal separator) that opens
 * a segment, with segments or a drive or UNC prefix around it. `"a\\n b"`, `"C:\\x\\.hidden"` and a
 * regex-escaped dot (`"CFG/spawn\\.point"`) are not paths.
 */
function isWindowsPath(raw: string): boolean {
  const separates = [...raw.matchAll(/\\+/g)].some((run) => {
    const next = raw[(run.index ?? 0) + run[0].length] ?? "";
    return run[0].length >= 2 && /[A-Za-z0-9_$~^-]/.test(next);
  });
  if (!separates) return false;
  const decoded = raw.replace(/\\\\/g, "\\");
  if (/^[A-Za-z]:[\\/]/.test(decoded) || /^\\\\/.test(decoded)) return true;
  if (/\s/.test(decoded)) return false;
  return decoded.split(/[\\/]/).filter(Boolean).length >= 2;
}

/** A literal that is only a path (no spaces, at least one separator). */
function isPathish(raw: string): boolean {
  return !/\s/.test(raw) && /[\\/]/.test(raw);
}

function isPosixAbsolute(raw: string): boolean {
  return /^\/[^/*]/.test(raw);
}

/** The suggestion for one offender, so the fix is one edit rather than a search. */
function fixFor(rule: string, raw: string): string {
  if (rule === "bare-separator") return "assert the value with `sep`, or build it with `join(...)` on both sides";
  if (rule === "posix-absolute") return "start the fixture at a root from `resolve(...)`, or pass segments to `join(...)`";
  const segments = raw
    .replace(/\\\\/g, "/")
    .split(/[\\/]/)
    .filter((part) => part !== "" && !/^[A-Za-z]:$/.test(part));
  if (segments.length >= 2) return `join(${segments.map((part) => JSON.stringify(part)).join(", ")})`;
  return "`sep`, or a value built the same way the code builds it";
}

/** Assertions in `source` that encode one platform's separator, by line. */
export function findSeparatorAssertions(source: string): PathHit[] {
  const hits: PathHit[] = [];
  const literals = literalsOf(source);
  const lines = source.split("\n");

  const balance = (text: string): number => (text.match(/\(/g) ?? []).length - (text.match(/\)/g) ?? []).length;

  /** The assertion a literal sits in, when it spans lines: from the `expect(` to its closing paren. */
  const statementAt = (index: number): string => {
    let start = index;
    const opens = (at: number): boolean => ASSERTION.test(lines[at] ?? "") || /\bexpect\(/.test(lines[at] ?? "");
    if (!opens(index)) {
      for (let back = index - 1; back >= 0 && index - back <= 5; back -= 1) {
        if (balance(lines[back] ?? "") > 0 && opens(back)) {
          start = back;
          break;
        }
      }
    }
    if (start === index && !opens(index)) return lines[index] ?? "";
    let end = start;
    let depth = 0;
    while (end < lines.length && end - start <= 12) {
      depth += balance(lines[end] ?? "");
      if (depth <= 0) break;
      end += 1;
    }
    return lines.slice(start, end + 1).join("\n");
  };

  /** `toBe("literal")` and friends: the expected value is the whole literal, so no code builds it. */
  const literalExpectations = (statement: string): string[] =>
    [...statement.matchAll(/\.(?:toBe|toEqual|toContain|toMatch)\(\s*["'`]([^"'`]*)["'`]\s*\)/g)].map((match) => match[1] ?? "");

  const seen = new Set<string>();
  for (const literal of literals) {
    const index = literal.line - 1;
    const lineText = lines[index] ?? "";
    const statement = statementAt(index);
    const expectedValues = literalExpectations(statement);
    const asserted = ASSERTION.test(statement);

    let rule: string | null = null;
    if (BARE_SEPARATOR.test(statement) && /^(?:\\+|\/)$/.test(literal.raw)) rule = "bare-separator";
    else if (isWindowsPath(literal.raw) && asserted) rule = "windows-separator";
    else if (isPosixAbsolute(literal.raw) && ROOTING_CALL.test(lineText)) rule = "posix-absolute";
    else if (isPathish(literal.raw) && asserted && OS_PATH_RESULT.test(statement) && expectedValues.includes(literal.raw)) {
      rule = "os-path-result";
    }
    if (rule === null) continue;

    const key = `${literal.line}:${literal.raw}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ line: literal.line, rule, text: lineText.trim().slice(0, 140), fix: fixFor(rule, literal.raw) });
  }
  return hits.sort((left, right) => left.line - right.line);
}

export interface AllowEntry {
  file: string;
  /** A substring of the offending line, so the entry survives line drift. */
  match: string;
  reason: string;
}

export interface Finding extends PathHit {
  file: string;
  reason: string | null;
}

function isTestFile(relativePath: string): boolean {
  const name = relativePath.split("/").pop() ?? "";
  if (name === SELF) return false;
  if (!/\.test\.tsx?$/.test(name)) return false;
  if (relativePath.startsWith("scripts/")) return true;
  return /^packages\/[^/]+\/src\//.test(relativePath);
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.startsWith(".") || SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

export function readAllowlist(root: string): AllowEntry[] {
  const path = join(root, ALLOW_REL);
  if (!existsSync(path)) return [];
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  const entries = (parsed as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) throw new Error(`${ALLOW_REL}: expected {"entries": [...]}`);
  return entries.map((entry) => {
    const { file, match, reason } = entry as Partial<AllowEntry>;
    if (typeof file !== "string" || typeof match !== "string" || typeof reason !== "string" || reason.trim() === "") {
      throw new Error(`${ALLOW_REL}: every entry needs a file, a match and a reason`);
    }
    return { file, match, reason };
  });
}

/** Every separator assertion in the repository, with the allowlist entry that explains it or null. */
export function scanPathPortability(root: string): Finding[] {
  const allow = readAllowlist(root);
  const findings: Finding[] = [];
  for (const dir of ROOTS) {
    for (const path of walk(join(root, dir)).sort()) {
      const file = relative(root, path).split("\\").join("/");
      if (!isTestFile(file)) continue;
      for (const hit of findSeparatorAssertions(readFileSync(path, "utf8"))) {
        const entry = allow.find((candidate) => candidate.file === file && hit.text.includes(candidate.match));
        findings.push({ ...hit, file, reason: entry?.reason ?? null });
      }
    }
  }
  return findings;
}

/** An allowlist entry that no longer matches is stale: it must be removed rather than kept as a blanket. */
export function staleAllowlist(root: string, findings: readonly Finding[]): AllowEntry[] {
  return readAllowlist(root).filter(
    (entry) => !findings.some((finding) => finding.file === entry.file && finding.text.includes(entry.match)),
  );
}

export const GUIDANCE =
  "Build the expected path the way the code builds it: `join(\"proofs\", \"flows\")`, `sep`, or the same value\n" +
  "the implementation returns. A test that is genuinely one platform's is named in\n" +
  "scripts/path-portability-allow.json with a reason (a git path is always `/`; a Windows command line\n" +
  "takes a Windows path), and that reason is printed on every run.";

const USAGE: Usage = {
  summary: "fail a test that asserts one platform's path separator",
  usage: "bun run check:path-portability [--root <dir>]",
  flags: [{ flag: "--root <dir>", detail: "scan this tree instead of the repository (used by the gate's own fixture test)" }],
  example: "bun run check:path-portability",
  exits: ["0 no unallowlisted separator assertion", "1 an offender, or a stale allowlist entry", "2 --root has no value"],
};

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (printHelpIfAsked("check:path-portability", USAGE, argv)) process.exit(0);
  const at = argv.indexOf("--root");
  const root = at < 0 ? fileURLToPath(new URL("..", import.meta.url)) : argv[at + 1];
  if (root === undefined) {
    console.error("check-path-portability: --root needs a value");
    process.exit(2);
  }
  const findings = scanPathPortability(root);
  const offenders = findings.filter((finding) => finding.reason === null);
  const allowed = findings.filter((finding) => finding.reason !== null);
  const stale = staleAllowlist(root, findings);

  for (const finding of allowed) {
    console.log(`  allow  ${finding.file}:${finding.line}  ${finding.rule}  ${finding.reason}`);
  }
  if (offenders.length === 0 && stale.length === 0) {
    console.log(`check-path-portability: ok (${allowed.length} allowlisted)`);
    process.exit(0);
  }
  if (offenders.length > 0) {
    console.error("check-path-portability: a test asserts one platform's path separator\n");
    for (const finding of offenders) {
      console.error(`  ${finding.file}:${finding.line}  ${finding.rule}`);
      console.error(`    ${finding.text}`);
      console.error(`    fix: ${finding.fix}`);
    }
    console.error(`\n${GUIDANCE}`);
  }
  for (const entry of stale) {
    console.error(`\ncheck-path-portability: stale allowlist entry, remove it: ${entry.file} / ${entry.match}`);
  }
  process.exit(1);
}
