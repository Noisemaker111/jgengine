import { execFileSync } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";
import { basename } from "node:path";

/**
 * Publish PR screenshots to the `pr-shots` archive branch without touching the working tree.
 *
 * Uploading PNGs through the GitHub contents API means hand-carrying ~80 KB of base64 as a tool
 * argument, which mangles reliably. This instead hashes each file straight into the object store,
 * builds a commit against `pr-shots` with a detached index, and pushes it — the working branch,
 * HEAD, and index are never touched. Prints the raw.githubusercontent URLs to paste into a PR body.
 *
 *   bun run pr-shots shots/foo-play.png shots/foo-ui.png
 *   bun run pr-shots --branch claude/123-thing --dir claude/123-thing shots/*.png
 *   bun run pr-shots --dry shots/foo.png        # print URLs, push nothing
 */

const ARCHIVE_BRANCH = "pr-shots";

interface Args {
  files: string[];
  dir: string | null;
  branch: string | null;
  message: string | null;
  dry: boolean;
}

function git(args: string[], env?: NodeJS.ProcessEnv): string {
  return execFileSync("git", args, { encoding: "utf8", env: env ?? process.env }).trim();
}

function tryGit(args: string[]): string | null {
  try {
    return git(args);
  } catch {
    return null;
  }
}

function parseArgs(argv: string[]): Args {
  const files: string[] = [];
  let dir: string | null = null;
  let branch: string | null = null;
  let message: string | null = null;
  let dry = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--dir") dir = argv[++i] ?? null;
    else if (arg === "--branch") branch = argv[++i] ?? null;
    else if (arg === "--message" || arg === "-m") message = argv[++i] ?? null;
    else if (arg === "--dry" || arg === "--dry-run") dry = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith("-")) fail(`unknown flag: ${arg}`);
    else files.push(arg);
  }
  return { files, dir, branch, message, dry };
}

function printHelp(): void {
  process.stdout.write(
    [
      "Publish PR screenshots to the pr-shots archive branch.",
      "",
      "  bun run pr-shots <file.png> [more.png ...]",
      "",
      "Flags:",
      "  --branch <name>   PR branch these shots belong to (default: current branch)",
      "  --dir <subdir>    Path under pr-shots/ to store them (default: the branch name)",
      "  -m, --message <s> Commit message (default: derived)",
      "  --dry             Print the raw URLs and do nothing else",
      "",
      "Prints the raw.githubusercontent.com URLs to embed in the PR body.",
      "",
    ].join("\n"),
  );
}

function fail(message: string): never {
  process.stderr.write(`pr-shots: ${message}\n`);
  process.exit(1);
}

function resolveRepo(): { owner: string; repo: string } {
  const url = tryGit(["remote", "get-url", "origin"]);
  if (url === null) fail("no origin remote");
  const match = url.replace(/\.git$/, "").match(/([^/:]+)\/([^/]+)$/);
  if (match === null) fail(`could not parse owner/repo from origin: ${url}`);
  return { owner: match[1]!, repo: match[2]! };
}

const parsed = parseArgs(process.argv.slice(2));
if (parsed.files.length === 0) {
  printHelp();
  fail("no files given");
}
for (const file of parsed.files) {
  if (!existsSync(file) || !statSync(file).isFile()) fail(`not a file: ${file}`);
}

const { owner, repo } = resolveRepo();
const branch = parsed.branch ?? git(["rev-parse", "--abbrev-ref", "HEAD"]);
const subdir = (parsed.dir ?? branch).replace(/^\/+|\/+$/g, "");
const rawUrl = (name: string): string =>
  `https://raw.githubusercontent.com/${owner}/${repo}/${ARCHIVE_BRANCH}/${ARCHIVE_BRANCH}/${subdir}/${name}`;

const uploads = parsed.files.map((file) => ({ file, name: basename(file), path: `${ARCHIVE_BRANCH}/${subdir}/${basename(file)}` }));

if (parsed.dry) {
  for (const { name } of uploads) process.stdout.write(`${rawUrl(name)}\n`);
  process.exit(0);
}

// Base the new commit on the existing archive branch, or on main the first time.
const hasArchive = tryGit(["ls-remote", "--exit-code", "origin", ARCHIVE_BRANCH]) !== null;
const baseRef = hasArchive ? ARCHIVE_BRANCH : "main";
git(["fetch", "-q", "origin", baseRef]);
const baseCommit = git(["rev-parse", `origin/${baseRef}`]);

const indexFile = `.git/pr-shots-index-${process.pid}`;
const indexEnv: NodeJS.ProcessEnv = { ...process.env, GIT_INDEX_FILE: indexFile };
let commit: string;
try {
  git(["read-tree", baseCommit], indexEnv);
  for (const { file, path } of uploads) {
    const blob = git(["hash-object", "-w", file]);
    git(["update-index", "--add", "--cacheinfo", `100644,${blob},${path}`], indexEnv);
  }
  const tree = git(["write-tree"], indexEnv);
  const message = parsed.message ?? `Add PR shots for ${subdir}`;
  commit = git(["commit-tree", tree, "-p", baseCommit, "-m", message]);
  git(["push", "-q", "origin", `${commit}:refs/heads/${ARCHIVE_BRANCH}`]);
} finally {
  rmSync(indexFile, { force: true });
}

process.stdout.write(`pushed ${uploads.length} shot(s) to ${ARCHIVE_BRANCH} (${commit.slice(0, 8)})\n\n`);
for (const { name } of uploads) process.stdout.write(`![${name.replace(/\.[^.]+$/, "")}](${rawUrl(name)})\n`);
