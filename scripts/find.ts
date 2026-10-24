// A lane that searches with a recursive directory listing asks Windows to walk
// every file under node_modules, Games and a hundred worktrees before it answers.
// Eight of the ten hard timeouts in three hours of transcripts were exactly that
// (a PowerShell tree listing over the engine repo, `~/Projects` or `studios/registry`,
// against a 120 s limit), while every other call had a 10.5 s p90.
//
// This is the one search command instead. ripgrep reads the tree once, honours
// .gitignore and never opens a skipped directory, so a repository-wide question
// answers in about a second.
//
//   bun run find <pattern>                    file:line:match
//   bun run find <pattern> --files            file names with a match
//   bun run find --files --glob '*.test.ts'   names by glob, no content pattern
//   bun run find useGame --kind ts,tsx --in packages/core/src
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, type Dirent } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import { printHelpIfAsked, type Usage } from "./script-help";

export const EXIT_MATCH = 0;
export const EXIT_NONE = 1;
export const EXIT_ERROR = 2;

/** Directories a search never enters: dependencies, history, other checkouts and build output. */
export const SKIP_DIRS = [
  "node_modules",
  ".git",
  ".claude",
  "dist",
  "build",
  "out",
  "coverage",
  ".turbo",
  ".next",
  ".scratch",
  "Games",
] as const;

export interface FindOptions {
  /** Content pattern (ripgrep regex syntax); absent lists files by `--glob`/`--kind` only. */
  pattern?: string;
  /** Directory to search; defaults to the current one. */
  in?: string;
  /** Extensions without dots, such as `ts,tsx`. */
  kind?: readonly string[];
  /** File name globs, such as `*.test.ts` or `**&#47;core&#47;*.ts`. */
  glob?: readonly string[];
  /** Names only, no line text. */
  files?: boolean;
  /** Stop after this many matches. */
  limit?: number;
  /**
   * Read files git ignores too. A search inside `.scratch/` is under the repository's own ignore
   * rules, which is right for a lane and wrong for a fixture; only the tests ask for this.
   */
  noIgnore?: boolean;
}

export interface FindResult {
  /** Lines to print, already in the requested shape. */
  lines: string[];
  /** False when ripgrep was missing and the git-backed reader answered instead. */
  usedRipgrep: boolean;
}

/** The `-g` globs that keep a search out of skipped directories. */
export function skipGlobs(dirs: readonly string[] = SKIP_DIRS): string[] {
  return dirs.map((dir) => `!**/${dir}/**`);
}

/** `ts,tsx` or `.ts,.tsx` as ripgrep globs: `*.ts`, `*.tsx`. */
export function kindGlobs(kind: readonly string[]): string[] {
  return kind.map((entry) => `*.${entry.replace(/^\./, "")}`);
}

export function ripgrepArgs(options: FindOptions): string[] {
  const args = ["--no-heading", "--line-number", "--color", "never", "--no-messages"];
  if (options.files === true) args.push(options.pattern === undefined ? "--files" : "--files-with-matches");
  if (options.noIgnore === true) args.push("--no-ignore-vcs");
  for (const glob of skipGlobs()) args.push("--glob", glob);
  for (const glob of kindGlobs(options.kind ?? [])) args.push("--glob", glob);
  for (const glob of options.glob ?? []) args.push("--glob", glob);
  // `--files` has no match count to cap, so that limit is applied to its output instead.
  if (options.limit !== undefined && options.files !== true) args.push("--max-count", String(options.limit));
  if (options.pattern !== undefined) args.push("--regexp", options.pattern);
  // `.` as the path, with the search root as the working directory, keeps results relative to it.
  args.push(".");
  return args;
}

/** Globs as one regular expression, for the reader used when ripgrep is absent: `*`, `**`, `?` and `{a,b}`. */
export function globToRegExp(glob: string): RegExp {
  let source = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index]!;
    if (char === "*") {
      if (glob[index + 1] === "*") {
        source += ".*";
        index += 1;
        if (glob[index + 1] === "/") index += 1;
      } else source += "[^/]*";
    } else if (char === "?") source += "[^/]";
    else if (char === "{") {
      const close = glob.indexOf("}", index);
      if (close < 0) source += "\\{";
      else {
        source += `(?:${glob.slice(index + 1, close).split(",").map(escapeRegExp).join("|")})`;
        index = close;
      }
    } else source += escapeRegExp(char);
  }
  return new RegExp(`^${source}$`);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function hasRipgrep(): boolean {
  return spawnSync("rg", ["--version"], { stdio: "ignore" }).status === 0;
}

/** Every file under `root`, pruning the same directories a ripgrep search never enters. */
function readTree(root: string): string[] {
  const found: string[] = [];
  const visit = (dir: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || (SKIP_DIRS as readonly string[]).includes(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) found.push(path);
    }
  };
  visit(root);
  return found;
}

/**
 * The same answer without ripgrep, for a runner or a cloud session that has none. Slower and blind
 * to `.gitignore`; the skipped directories are the same, so it still never reads node_modules.
 */
export function findInProcess(options: FindOptions): FindResult {
  const root = resolve(options.in ?? ".");
  const nameGlobs = [...kindGlobs(options.kind ?? []), ...(options.glob ?? [])].map(globToRegExp);
  const selected = (file: string): boolean =>
    nameGlobs.length === 0 || nameGlobs.some((glob) => glob.test(file) || glob.test(file.split("/").pop() ?? ""));
  const matcher = options.pattern === undefined ? undefined : new RegExp(options.pattern);
  const lines: string[] = [];
  for (const path of readTree(root)) {
    const file = relative(root, path).split(sep).join("/");
    if (!selected(file)) continue;
    if (matcher === undefined) {
      lines.push(file);
    } else {
      let contents: string;
      try {
        contents = readFileSync(path, "utf8");
      } catch {
        continue;
      }
      if (options.files === true) {
        if (matcher.test(contents)) lines.push(file);
      } else {
        contents.split("\n").forEach((text, index) => {
          if (matcher.test(text)) lines.push(`${file}:${index + 1}:${text}`);
        });
      }
    }
    if (options.limit !== undefined && lines.length >= options.limit) break;
  }
  return { lines: options.limit === undefined ? lines : lines.slice(0, options.limit), usedRipgrep: false };
}

/** `.\scripts\find.ts:12:` reads the same everywhere as `scripts/find.ts:12:`. */
export function normalizePath(line: string): string {
  const match = /^(.*?)(?::(\d+):(.*))?$/.exec(line);
  const path = (match?.[1] ?? line).replace(/^\.\//, "").replace(/^\.\\/, "").split("\\").join("/");
  return match?.[2] === undefined ? path : `${path}:${match[2]}:${match[3] ?? ""}`;
}

/** Run one search, returning the lines to print. Throws on a pattern ripgrep rejects. */
export function search(options: FindOptions): FindResult {
  const root = resolve(options.in ?? ".");
  try {
    statSync(root);
  } catch {
    throw new Error(`--in is not a directory: ${root}`);
  }
  if (!statSync(root).isDirectory()) throw new Error(`--in is not a directory: ${root}`);
  if (!hasRipgrep()) return findInProcess(options);
  const result = spawnSync("rg", ripgrepArgs(options), {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== EXIT_MATCH && result.status !== EXIT_NONE) {
    throw new Error(`rg exited ${result.status ?? "?"}: ${(result.stderr ?? "").trim()}`);
  }
  const lines = (result.stdout ?? "").split("\n").filter((line) => line !== "").map(normalizePath);
  // `--max-count` bounds each file, so the total a lane sees is capped here as well.
  const limited = options.limit !== undefined ? lines.slice(0, options.limit) : lines;
  return { lines: limited, usedRipgrep: true };
}

const USAGE: Usage = {
  summary: "search the repo with ripgrep instead of walking it with a recursive listing",
  usage: "bun run find <pattern> [--in <dir>] [--kind ts,tsx] [--glob <glob>] [--files] [--limit <n>]",
  flags: [
    { flag: "--in <dir>", detail: "search this directory instead of the current one" },
    { flag: "--kind <list>", detail: "only these extensions, comma separated: --kind ts,tsx" },
    { flag: "--glob <glob>", detail: "only files matching this name glob, such as '*.test.ts' (repeatable)" },
    { flag: "--files", detail: "print file names only; with no pattern, list the files the globs select" },
    { flag: "--limit <n>", detail: "stop after n matches" },
  ],
  example: "bun run find hubLayout --kind ts,tsx",
  exits: [
    "0 at least one match",
    "1 no match",
    "2 a bad flag, a missing directory or a pattern ripgrep rejected",
  ],
};

function value(argv: readonly string[], flag: string): string | undefined {
  const at = argv.indexOf(flag);
  if (at < 0) return undefined;
  const found = argv[at + 1];
  if (found === undefined || found.startsWith("--")) throw new Error(`${flag} needs a value`);
  return found;
}

function values(argv: readonly string[], flag: string): string[] {
  const found: string[] = [];
  argv.forEach((arg, index) => {
    const next = argv[index + 1];
    if (arg === flag && next !== undefined && !next.startsWith("--")) found.push(next);
  });
  return found;
}

export function parseArgs(argv: readonly string[]): FindOptions {
  const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
  const known = new Set(["--in", "--kind", "--glob", "--files", "--limit", "--help", "-h"]);
  const unknown = [...flags].find((flag) => !known.has(flag));
  if (unknown !== undefined) throw new Error(`unknown flag ${unknown}`);
  const pattern = argv.find((arg, index) => !arg.startsWith("--") && !(index > 0 && ["--in", "--kind", "--glob", "--limit"].includes(argv[index - 1]!)));
  const options: FindOptions = {
    pattern,
    in: value(argv, "--in"),
    kind: values(argv, "--kind").flatMap((entry) => entry.split(",")).filter((entry) => entry !== ""),
    glob: values(argv, "--glob"),
    files: flags.has("--files"),
  };
  const limit = value(argv, "--limit");
  if (limit !== undefined) {
    const parsed = Number(limit);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("--limit needs a positive whole number");
    options.limit = parsed;
  }
  if (options.pattern === undefined && options.files !== true) throw new Error("a pattern is required unless --files lists by --glob/--kind");
  return options;
}

function main(argv: readonly string[]): number {
  if (printHelpIfAsked("find", USAGE, argv)) return EXIT_MATCH;
  let options: FindOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`find: ${(error as Error).message}`);
    console.error(`usage: ${USAGE.usage}`);
    return EXIT_ERROR;
  }
  try {
    const result = search(options);
    if (!result.usedRipgrep) console.error("find: ripgrep not found; read the tree in this process instead (slower, and .gitignore is not applied)");
    if (result.lines.length === 0) {
      console.error(`find: no match for ${options.pattern ?? options.glob?.join(" ") ?? "--files"}`);
      return EXIT_NONE;
    }
    for (const line of result.lines) console.log(line);
    return EXIT_MATCH;
  } catch (error) {
    console.error(`find: ${(error as Error).message}`);
    return EXIT_ERROR;
  }
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
