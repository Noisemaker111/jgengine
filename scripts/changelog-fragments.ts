// Unreleased notes live one file per PR under changes/, so parallel PRs never edit the same
// lines of CHANGELOG.md. `bun run release` folds them into `## [Unreleased]` and deletes them.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const FRAGMENT_DIR = "changes";
export const FRAGMENT_PATTERN = /^changes\/(?!README\.md$)[^/]+\.md$/;

const ORDER = ["Migrate", "Added", "Changed", "Fixed", "Removed"];

/** Group a notes body by its `### Heading`, keeping each bullet's raw markdown lines. */
export function groupByHeading(lines: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  let heading: string | null = null;
  for (const line of lines) {
    const match = /^###\s+(\w+)/.exec(line);
    if (match) {
      heading = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
      if (!groups.has(heading)) groups.set(heading, []);
      continue;
    }
    if (heading) groups.get(heading)!.push(line);
  }
  for (const [key, body] of groups) groups.set(key, trim(body));
  return groups;
}

/** Append fragment bullets to the matching `###` sections of the `## [Unreleased]` block. */
export function foldFragments(markdown: string, fragments: string[]): string {
  if (fragments.length === 0) return markdown;
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
  const block = lines.slice(start + 1, end);
  const firstHeading = block.findIndex((l) => /^###\s+/.test(l));
  const preamble = trim(firstHeading < 0 ? block : block.slice(0, firstHeading));
  const groups = groupByHeading(firstHeading < 0 ? [] : block.slice(firstHeading));

  for (const fragment of fragments) {
    const parsed = groupByHeading(fragment.split("\n"));
    if (parsed.size === 0) throw new Error(`changelog fragment has no ### Migrate/Added/Changed/Fixed/Removed heading:\n${fragment}`);
    for (const [heading, body] of parsed) {
      if (body.length === 0) continue;
      const existing = groups.get(heading) ?? [];
      groups.set(heading, existing.length === 0 ? body : [...existing, ...body]);
    }
  }

  const headings = [...ORDER.filter((h) => groups.has(h)), ...[...groups.keys()].filter((h) => !ORDER.includes(h))];
  const rendered: string[] = ["## [Unreleased]", ""];
  if (preamble.length > 0) rendered.push(...preamble, "");
  for (const heading of headings) {
    const body = groups.get(heading)!;
    if (body.length === 0) continue;
    rendered.push(`### ${heading}`, "", ...body, "");
  }
  return [...lines.slice(0, start), ...rendered, ...lines.slice(end)].join("\n");
}

/** Fragment files currently on disk, sorted so the fold order is stable. */
export function readFragments(root: string): { path: string; text: string }[] {
  const dir = join(root, FRAGMENT_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => FRAGMENT_PATTERN.test(`${FRAGMENT_DIR}/${name}`))
    .sort()
    .map((name) => ({ path: join(dir, name), text: readFileSync(join(dir, name), "utf8") }));
}

function trim(lines: string[]): string[] {
  let a = 0;
  let b = lines.length;
  while (a < b && lines[a].trim() === "") a++;
  while (b > a && lines[b - 1].trim() === "") b--;
  return lines.slice(a, b);
}
