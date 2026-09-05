// One command for a whole release cut, so publishing is not a hand-assembled sequence:
//   bun run release              # 0.17.0 -> 0.18.0, cut CHANGELOG, mirror, regen api.md
//   bun run release --dry-run    # print the plan, write nothing
//   bun run release --no-gen     # skip the generated-artifact refresh
//
// It runs set-version --release, renames `## [Unreleased]` to the new version, prepends the
// lockstep Migrate bullet, leaves a fresh empty [Unreleased], and mirrors the same notes into
// the typed CHANGELOG export in packages/core/src/meta/changelog.ts.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

function main(): void {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const skipGen = args.includes("--no-gen");
  const patchRelease = args.includes("--patch");
  const read = (rel: string) => readFileSync(`${root}${rel}`, "utf8");
  const version = (pkg: string) => JSON.parse(read(`packages/${pkg}/package.json`)).version as string;

  const changelogPath = `${root}CHANGELOG.md`;
  const mirrorPath = `${root}packages/core/src/meta/changelog.ts`;
  const markdown = read("CHANGELOG.md");
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
  }

  const sdk = dryRun ? nextReleaseVersion(version("core"), patchRelease) : version("core");
  const cli = dryRun ? nextReleaseVersion(version("jgengine"), patchRelease) : version("jgengine");
  const github = dryRun ? nextReleaseVersion(version("github"), patchRelease) : version("github");
  const lockstep = lockstepBullet(sdk, cli, github);
  sections.migrate.unshift(plainText(lockstep));

  const nextMarkdown = cutChangelog(markdown, sdk, lockstep);
  const nextMirror = mirrorEntry(read("packages/core/src/meta/changelog.ts"), sdk, sections);

  if (dryRun) {
    console.log(`release --dry-run: would cut ${sdk} (CLI ${cli}, @jgengine/github ${github})`);
    for (const key of ["migrate", "added", "changed", "removed"] as const) {
      console.log(`  ${key}: ${sections[key].length}`);
    }
    return;
  }

  writeFileSync(changelogPath, nextMarkdown);
  writeFileSync(mirrorPath, nextMirror);
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
