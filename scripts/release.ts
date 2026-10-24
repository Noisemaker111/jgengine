// One command for a whole release cut, so publishing is not a hand-assembled sequence:
//   bun run release              # 0.17.0 -> 0.18.0, cut CHANGELOG, mirror, regen api.md
//   bun run release --dry-run    # print the plan, write nothing
//   bun run release --no-gen     # skip the generated-artifact refresh
//
// A release is a milestone, not a step after each change: publish at most about once a day,
// or when a game ships outside this machine. Lanes adopt unreleased commits with
// `bun run engine:pin --ref <sha>` in JGengine-games, so nothing here has to run per PR.
// Those fragments accumulate until a cut; cutting per change cost ~40 serial minutes each and
// published 0.38.2, a patch that narrowed two public types for one field.
//
// It refuses a commit that does not contain origin/beta: a release cut from a stale main published
// `@jgengine/core@0.35.0` four merges behind beta and six game lanes could not import `agents/system`.
//
// It folds the per-PR notes in changes/*.md into `## [Unreleased]` and deletes them, runs
// set-version --release, renames `## [Unreleased]` to the new version, prepends the
// lockstep Migrate bullet, leaves a fresh empty [Unreleased], and mirrors the same notes into
// the typed CHANGELOG export in packages/core/src/meta/changelog.ts.
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { foldFragments, readFragments } from "./changelog-fragments";

export interface ChangelogSections {
  migrate: string[];
  added: string[];
  changed: string[];
  removed: string[];
}

const HEADING_TO_KEY: Record<string, keyof ChangelogSections> = {
  migrate: "migrate",
  added: "added",
  changed: "changed",
  removed: "removed",
  fixed: "changed",
};

/** Slice the lines of one `## ` section out of a markdown document. */
export function sectionLines(markdown: string, heading: string): string[] {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) return [];
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end);
}

/** Split `<!-- ... -->` guidance from the authored bullets of an `## [Unreleased]` block. */
export function splitComment(lines: string[]): { comment: string[]; body: string[] } {
  const comment: string[] = [];
  const body: string[] = [];
  let inComment = false;
  for (const line of lines) {
    if (line.trimStart().startsWith("<!--")) inComment = true;
    if (inComment) {
      comment.push(line);
      if (line.includes("-->")) inComment = false;
      continue;
    }
    body.push(line);
  }
  return { comment, body };
}

/** Markdown bullets under `### Migrate|Added|Changed|Removed|Fixed` as plain one-line strings. */
export function parseSections(lines: string[]): ChangelogSections {
  const sections: ChangelogSections = { migrate: [], added: [], changed: [], removed: [] };
  let key: keyof ChangelogSections | null = null;
  let current: string[] = [];
  const flush = () => {
    if (key && current.length > 0) sections[key].push(plainText(current.join(" ")));
    current = [];
  };
  for (const line of lines) {
    const heading = /^###\s+(\w+)/.exec(line);
    if (heading) {
      flush();
      key = HEADING_TO_KEY[heading[1].toLowerCase()] ?? null;
      continue;
    }
    if (/^-\s+/.test(line)) {
      flush();
      current = [line.replace(/^-\s+/, "")];
      continue;
    }
    if (current.length > 0 && line.trim() !== "") current.push(line.trim());
    else if (line.trim() === "") flush();
  }
  flush();
  return sections;
}

/** Bold markers and wrapped whitespace do not survive into the typed mirror. */
export function plainText(text: string): string {
  return text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

export function lockstepBullet(sdk: string, cli: string, github: string): string {
  return (
    `**Bump lockstep SDK packages to \`^${sdk}\`:** ` +
    `\`@jgengine/{core,rapier,react,ws,node,sql,convex,shell,editor,assets,navbake}\`. ` +
    `CLI \`jgengine\` is \`${cli}\`; \`@jgengine/github\` is \`${github}\`.`
  );
}

/** Rename `## [Unreleased]` to `## <version>`, prepend the lockstep bullet, leave a fresh block. */
export function cutChangelog(markdown: string, version: string, lockstep: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => l.trim() === "## [Unreleased]");
  if (start < 0) throw new Error("CHANGELOG.md has no `## [Unreleased]` heading.");
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) {
      end = i;
      break;
    }
  }
  const { comment, body } = splitComment(lines.slice(start + 1, end));
  const released = withLockstep(trimBlank(body), lockstep);
  const replacement = [
    "## [Unreleased]",
    "",
    ...trimBlank(comment),
    "",
    `## ${version}`,
    "",
    ...released,
    "",
  ];
  return [...lines.slice(0, start), ...replacement, ...lines.slice(end)].join("\n");
}

function withLockstep(body: string[], lockstep: string): string[] {
  const migrateAt = body.findIndex((l) => /^###\s+Migrate\b/i.test(l));
  if (migrateAt < 0) return ["### Migrate", "", `- ${lockstep}`, "", ...body];
  const insertAt = body.findIndex((l, i) => i > migrateAt && /^-\s+/.test(l));
  const at = insertAt < 0 ? migrateAt + 2 : insertAt;
  return [...body.slice(0, at), `- ${lockstep}`, ...body.slice(at)];
}

function trimBlank(lines: string[]): string[] {
  let a = 0;
  let b = lines.length;
  while (a < b && lines[a].trim() === "") a++;
  while (b > a && lines[b - 1].trim() === "") b--;
  return lines.slice(a, b);
}

/** Insert the new version's typed entry at the top of the `CHANGELOG` record. */
export function mirrorEntry(source: string, version: string, sections: ChangelogSections): string {
  const anchor = "export const CHANGELOG: Record<string, ChangelogEntry> = {";
  const at = source.indexOf(anchor);
  if (at < 0) throw new Error("changelog.ts has no CHANGELOG record to mirror into.");
  if (source.includes(`\n  "${version}": {`)) throw new Error(`changelog.ts already has a ${version} entry.`);
  const field = (key: keyof ChangelogSections) =>
    sections[key].length === 0
      ? `    ${key}: [],`
      : [`    ${key}: [`, ...sections[key].map((b) => `      ${JSON.stringify(b)},`), "    ],"].join("\n");
  const entry = [
    `  "${version}": {`,
    field("migrate"),
    field("added"),
    field("changed"),
    field("removed"),
    "  },",
  ].join("\n");
  const cut = at + anchor.length;
  return `${source.slice(0, cut)}\n${entry}${source.slice(cut)}`;
}

export interface GitResult {
  status: number;
  stdout: string;
  stderr: string;
}

export type GitRunner = (args: string[], cwd: string) => GitResult;

export const runGit: GitRunner = (args, cwd) => {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
};

export interface AncestorReport {
  ok: boolean;
  ref: string;
  target: string;
  targetSha: string | null;
  refSha: string | null;
  /** `<short sha> <subject>` for every commit on `ref` the target does not contain. */
  missing: string[];
  reason: string | null;
}

/**
 * A release may only be cut from a commit that contains the branch everything lands on. A release
 * cut from a stale `main` published `@jgengine/core@0.35.0` four merges behind `beta`, and six game
 * lanes could not import the `agents/system` module that had already merged.
 */
export function checkReleaseAncestor(input: {
  cwd: string;
  ref?: string;
  target?: string;
  git?: GitRunner;
}): AncestorReport {
  const git = input.git ?? runGit;
  const ref = input.ref ?? "origin/beta";
  const target = input.target ?? "HEAD";
  const resolve = (rev: string): string | null => {
    const out = git(["rev-parse", "--verify", `${rev}^{commit}`], input.cwd);
    return out.status === 0 ? out.stdout.trim() : null;
  };
  const targetSha = resolve(target);
  const refSha = resolve(ref);
  const base = { ref, target, targetSha, refSha };
  if (targetSha === null) return { ...base, ok: false, missing: [], reason: `cannot resolve ${target} as a commit` };
  if (refSha === null) {
    return { ...base, ok: false, missing: [], reason: `cannot resolve ${ref}, so the release cannot prove it contains the branch everything lands on` };
  }
  if (git(["merge-base", "--is-ancestor", ref, target], input.cwd).status === 0) {
    return { ...base, ok: true, missing: [], reason: null };
  }
  const log = git(["log", "--format=%h %s", `${target}..${ref}`], input.cwd);
  const missing = log.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  return { ...base, ok: false, missing, reason: `${ref} has ${missing.length} commit(s) that ${target} does not contain` };
}

/** The refusal a stale release branch prints, one line per fact. */
export function ancestorFailureLines(report: AncestorReport): string[] {
  const lines = [
    `release: refusing to cut from ${report.target}: ${report.reason ?? "it does not contain the branch everything lands on"}.`,
  ];
  if (report.missing.length > 0) {
    lines.push(`release: missing from ${report.target} (${report.ref} ${report.refSha?.slice(0, 8) ?? "?"}):`);
    for (const commit of report.missing) lines.push(`  ${commit}`);
  }
  lines.push("release: merge origin/beta into the release branch and run again.");
  return lines;
}

function main(): void {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const skipGen = args.includes("--no-gen");
  const patchRelease = args.includes("--patch");
  const read = (rel: string) => readFileSync(`${root}${rel}`, "utf8");
  const version = (pkg: string) => JSON.parse(read(`packages/${pkg}/package.json`)).version as string;

  // A release cut from a stale branch is how a published version ended up missing merged work.
  if (!args.includes("--no-fetch")) spawnSync("git", ["fetch", "--quiet", "origin", "beta"], { cwd: root, stdio: "ignore", timeout: 20_000 });
  const ancestor = checkReleaseAncestor({ cwd: root, target: args.includes("--commit") ? args[args.indexOf("--commit") + 1] : "HEAD" });
  if (!ancestor.ok) {
    for (const line of ancestorFailureLines(ancestor)) console.error(line);
    process.exit(1);
  }

  const changelogPath = `${root}CHANGELOG.md`;
  const mirrorPath = `${root}packages/core/src/meta/changelog.ts`;
  const fragments = readFragments(root);
  const markdown = foldFragments(read("CHANGELOG.md"), fragments.map((f) => f.text));
  const unreleased = splitComment(sectionLines(markdown, "## [Unreleased]")).body;
  const sections = parseSections(unreleased);
  const total = Object.values(sections).reduce((n, list) => n + list.length, 0);
  if (total === 0) {
    console.error("release: `## [Unreleased]` has no entries — nothing to cut.");
    process.exit(1);
  }

  if (!dryRun) {
    const bump = spawnSync("bun", ["scripts/set-version.ts", "--release", ...(patchRelease ? ["--patch"] : [])], { cwd: root, stdio: "inherit" });
    if (bump.status !== 0) process.exit(bump.status ?? 1);
    // Workspace versions live in bun.lock too; without this the lockfile keeps the old release.
    const lock = spawnSync("bun", ["install"], { cwd: root, stdio: "inherit" });
    if (lock.status !== 0) process.exit(lock.status ?? 1);
  }

  const sdk = dryRun ? nextReleaseVersion(version("core"), patchRelease) : version("core");
  const cli = dryRun ? nextReleaseVersion(version("jgengine"), patchRelease) : version("jgengine");
  const github = dryRun ? nextReleaseVersion(version("github"), patchRelease) : version("github");
  const lockstep = lockstepBullet(sdk, cli, github);
  sections.migrate.unshift(plainText(lockstep));

  const nextMarkdown = cutChangelog(markdown, sdk, lockstep);
  const nextMirror = mirrorEntry(read("packages/core/src/meta/changelog.ts"), sdk, sections);

  if (dryRun) {
    console.log(`release --dry-run: would cut ${sdk} (CLI ${cli}, @jgengine/github ${github}), folding ${fragments.length} fragment(s)`);
    for (const key of ["migrate", "added", "changed", "removed"] as const) {
      console.log(`  ${key}: ${sections[key].length}`);
    }
    return;
  }

  writeFileSync(changelogPath, nextMarkdown);
  writeFileSync(mirrorPath, nextMirror);
  for (const fragment of fragments) rmSync(fragment.path);
  console.log(`release: cut ${sdk} — CHANGELOG.md and the typed mirror now carry ${total + 1} note(s).`);

  if (!skipGen) {
    const gen = spawnSync("bun", ["scripts/gen-skill-api-safe.ts"], { cwd: root, stdio: "inherit" });
    if (gen.status !== 0) process.exit(gen.status ?? 1);
  }
  console.log("release: review the diff, then commit and open the release PR.");
}

/** Compute the version a normal or patch release will publish. */
export function nextReleaseVersion(version: string, patchRelease = false): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) throw new Error(`unparseable version: ${version}`);
  const [, major, minor, patch] = match;
  return version.includes("-") ? `${major}.${minor}.${patch}` : patchRelease ? `${major}.${minor}.${Number(patch) + 1}` : `${major}.${Number(minor) + 1}.0`;
}

if (import.meta.main) main();
