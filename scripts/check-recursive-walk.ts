/**
 * A recursive directory listing is what timed out lanes: over three hours of transcripts, eight of
 * the ten hard timeouts were a `Get-ChildItem -Recurse` walking node_modules, Games and a hundred
 * worktrees against a 120 s limit, while every other call's p90 was 10.5 s. The tree is what is slow,
 * not the timeout, so a search answers from ripgrep instead: `bun run find <pattern>`.
 *
 * This gate keeps one out of the repo. It fails a `scripts/**` file or a lane document (this
 * repository's AGENTS.md and README.md, and every skill under .claude/skills) that contains a
 * recursive listing, a `find` walk from a root, or `git ls-files` piped into per-file work. A real
 * need is exempted by a line comment naming the reason: `// walk-ok: <reason>`, on the call's line
 * or the comment line directly above it.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { printHelpIfAsked, type Usage } from "./script-help";

export const EXIT_PASS = 0;
export const EXIT_FAIL = 1;

const SCRIPT_ROOTS = ["scripts"];
/** Documents a lane is told to read and to copy commands from. */
const DOC_FILES = ["AGENTS.md", "README.md"];
const DOC_ROOTS = [".claude/skills"];
const EXTENSIONS = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|sh|ps1|psm1)$/;
const MARKDOWN = /\.md$/;
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", ".next", ".turbo", "coverage", ".scratch"]);
/**
 * This checker and its test spell the forbidden commands out as rules, messages and fixtures, the way
 * check-no-blocking-wait skips its own test. Nothing else is exempt.
 */
const SELF_FILES = new Set(["check-recursive-walk.ts", "check-recursive-walk.test.ts"]);

const RULES: readonly { readonly rule: string; readonly pattern: RegExp }[] = [
  { rule: "recursive listing", pattern: /\b(?:Get-ChildItem|gci)\b[^\n]*\s-(?:Recurse|r)\b/i },
  { rule: "recursive listing", pattern: /\bdir\s+\/s\b/i },
  { rule: "recursive listing", pattern: /\btree\s+\/f\b/i },
  { rule: "root walk", pattern: /(?<![\w-])find\s+(?:\/|\.\.?|~|\$HOME|\$\{HOME\})(?![\w.-])/ },
  { rule: "ls-files loop", pattern: /\bgit\s+ls-files\b[^\n]*\|/ },
];

/** `// walk-ok: reason`, `# walk-ok: reason` or `<!-- walk-ok: reason -->`; the reason must be words. */
const EXEMPTION = /walk-ok:\s*[A-Za-z0-9]/i;

export interface RecursiveWalk {
  /** 1-based line of the offending command. */
  line: number;
  rule: string;
  text: string;
}

function exempt(lines: readonly string[], index: number): boolean {
  if (EXEMPTION.test(lines[index] ?? "")) return true;
  return EXEMPTION.test(lines[index - 1] ?? "");
}

/** Every recursive directory walk in `source`, by 1-based line. */
export function findRecursiveWalks(source: string): RecursiveWalk[] {
  const found: RecursiveWalk[] = [];
  const lines = source.split("\n");
  lines.forEach((line, index) => {
    if (line.trim() === "" || exempt(lines, index)) return;
    const hit = RULES.find(({ pattern }) => pattern.test(line));
    if (hit !== undefined) found.push({ line: index + 1, rule: hit.rule, text: line.trim().slice(0, 160) });
  });
  return found;
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name) || (entry.name.startsWith(".") && entry.name !== ".claude")) continue;
    const path = join(dir, entry.name);
    // A checked-out symlink can point at a path this platform does not have.
    try {
      if (entry.isDirectory()) walk(path, out);
      else if (entry.isFile()) out.push(path);
    } catch {
      continue;
    }
  }
  return out;
}

/** Every file this gate reads: lane tooling under scripts/, plus the documents lanes copy commands from. */
export function scannedFiles(root: string): string[] {
  const files: string[] = [];
  for (const dir of SCRIPT_ROOTS) {
    for (const path of walk(join(root, dir))) {
      const name = path.split(/[\\/]/).pop() ?? "";
      if (EXTENSIONS.test(name) && !SELF_FILES.has(name)) files.push(path);
    }
  }
  for (const name of DOC_FILES) {
    const path = join(root, name);
    if (existsSync(path)) files.push(path);
  }
  for (const dir of DOC_ROOTS) {
    for (const path of walk(join(root, dir))) if (MARKDOWN.test(path)) files.push(path);
  }
  return files.sort();
}

export interface WalkFinding extends RecursiveWalk {
  file: string;
}

/** Every recursive walk a lane could copy out of this checkout. */
export function scanRepository(root: string): WalkFinding[] {
  const findings: WalkFinding[] = [];
  for (const path of scannedFiles(root)) {
    for (const walk of findRecursiveWalks(readFileSync(path, "utf8"))) {
      findings.push({ ...walk, file: relative(root, path).split("\\").join("/") });
    }
  }
  return findings;
}

const USAGE: Usage = {
  summary: "fail a script or lane document that walks a directory tree recursively",
  usage: "bun run check-recursive-walk [--root <dir>]",
  flags: [{ flag: "--root <dir>", detail: "scan this tree instead of the repository (used by the gate's own fixture test)" }],
  example: "bun run check-recursive-walk",
  exits: ["0 no unexempted recursive walk", "1 an offender, with the file, line and replacement"],
};

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (printHelpIfAsked("check-recursive-walk", USAGE, argv)) process.exit(EXIT_PASS);
  const at = argv.indexOf("--root");
  const root = at < 0 ? fileURLToPath(new URL("..", import.meta.url)) : argv[at + 1];
  if (root === undefined) {
    console.error("check-recursive-walk: --root needs a value");
    process.exit(2);
  }
  const findings = scanRepository(root);
  if (findings.length === 0) {
    console.log("check-recursive-walk: ok");
    process.exit(EXIT_PASS);
  }
  console.error("check-recursive-walk: a script or document walks a directory tree recursively\n");
  for (const finding of findings) {
    console.error(`  ${finding.file}:${finding.line}  ${finding.rule}`);
    console.error(`    ${finding.text}`);
  }
  console.error(
    "\nSearch instead: `bun run find <pattern> [--in <dir>] [--kind ts,tsx] [--files]` reads the tree once," +
      "\nhonours .gitignore and never enters node_modules, .git, .claude/worktrees or build output." +
      "\nIf the walk is genuinely required, name the reason on the line or the comment above it:" +
      "\n  // walk-ok: <reason>",
  );
  process.exit(EXIT_FAIL);
}
