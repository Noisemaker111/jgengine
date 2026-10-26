import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const CHANGELOG_URL = "https://raw.githubusercontent.com/Noisemaker111/jgengine/main/CHANGELOG.md";
const FETCH_TIMEOUT_MS = 8000;

/** One published release's notes, by Keep a Changelog section. */
export interface ReleaseNotes {
  version: string;
  migrate: string[];
  added: string[];
  changed: string[];
  removed: string[];
}

/** Parse CHANGELOG.md (Keep a Changelog shape: `## x.y.z` + `### Migrate/Added/Changed/Removed`). */
export function parseChangelogMarkdown(markdown: string): ReleaseNotes[] {
  const releases: ReleaseNotes[] = [];
  let release: ReleaseNotes | null = null;
  let bucket: string[] | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const versionMatch = /^## (\d+\.\d+\.\d+)\s*$/.exec(line);
    if (versionMatch !== null) {
      release = { version: versionMatch[1]!, migrate: [], added: [], changed: [], removed: [] };
      releases.push(release);
      bucket = null;
      continue;
    }
    if (release === null) continue;
    const sectionMatch = /^### (\w+)/.exec(line);
    if (sectionMatch !== null) {
      const section = sectionMatch[1]!.toLowerCase();
      bucket =
        section === "migrate" ? release.migrate
        : section === "added" ? release.added
        : section === "changed" ? release.changed
        : section === "removed" ? release.removed
        : null;
      continue;
    }
    if (bucket === null) continue;
    if (/^- /.test(line)) bucket.push(line.slice(2).trim());
    else if (/^\s+\S/.test(line) && bucket.length > 0) bucket[bucket.length - 1] += ` ${line.trim()}`;
  }
  return releases;
}

/** Numeric semver comparison over `x.y.z` strings: negative when a < b. */
export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Releases strictly after `from` up to and including `to`, oldest first (migrate order). */
export function releasesBetween(releases: ReleaseNotes[], from: string, to: string): ReleaseNotes[] {
  return releases
    .filter((entry) => compareSemver(entry.version, from) > 0 && compareSemver(entry.version, to) <= 0)
    .sort((a, b) => compareSemver(a.version, b.version));
}

/** The lowest stable `x.y.z` among SDK version ranges (`^0.43.0`, `0.44.1`), or null. */
export function lowestSdkVersion(ranges: string[]): string | null {
  const versions = ranges.map((range) => range.replace(/^[\^~]/, "")).filter((version) => /^\d+\.\d+\.\d+$/.test(version));
  return versions.length === 0 ? null : versions.sort(compareSemver)[0]!;
}

interface ChangelogModule {
  CHANGELOG?: Record<string, { migrate: readonly string[]; added: readonly string[]; changed: readonly string[]; removed: readonly string[] }>;
}

async function installedChangelog(projectDir: string): Promise<ReleaseNotes[] | null> {
  try {
    const resolved = createRequire(join(projectDir, "package.json")).resolve("@jgengine/core/meta/changelog");
    const module = (await import(pathToFileURL(resolved).href)) as ChangelogModule;
    if (module.CHANGELOG === undefined) return null;
    return Object.entries(module.CHANGELOG).map(([version, entry]) => ({
      version,
      migrate: [...entry.migrate],
      added: [...entry.added],
      changed: [...entry.changed],
      removed: [...entry.removed],
    }));
  } catch {
    return null;
  }
}

/** The published CHANGELOG.md, falling back to the project's installed `@jgengine/core/meta/changelog`. */
export async function loadReleaseNotes(projectDir: string): Promise<{ releases: ReleaseNotes[]; source: string }> {
  try {
    const response = await fetch(CHANGELOG_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (response.ok) {
      const releases = parseChangelogMarkdown(await response.text());
      if (releases.length > 0) return { releases, source: "published CHANGELOG.md" };
    }
  } catch {
    // Offline: the installed core ships the same notes, possibly older.
  }
  return { releases: (await installedChangelog(projectDir)) ?? [], source: "installed @jgengine/core (may lag; check the network)" };
}

/** What moving from `from` to `to` asks of a game: per release, Migrate, then Adopt, Changed and Removed. */
export function renderReleaseNotes(from: string, to: string, releases: ReleaseNotes[], source: string): string {
  const lines = [`@jgengine ${from} → ${to} (notes: ${source})`];
  if (releases.length === 0) {
    lines.push("No release notes cover this span; read the changelog before relying on new behavior.");
    return lines.join("\n");
  }
  for (const release of releases) {
    lines.push("", `## ${release.version}`);
    const sections: [string, string[]][] = [
      ["Migrate (do these, in order):", release.migrate],
      ["Adopt (new capability — consider wiring these into the game):", release.added],
      ["Changed:", release.changed],
      ["Removed:", release.removed],
    ];
    for (const [title, items] of sections) {
      if (items.length === 0) continue;
      lines.push(title, ...items.map((item) => `  - ${item}`));
    }
  }
  lines.push(
    "",
    "Next: install, rebuild, and do the Migrate steps oldest-first; then work the Adopt lists (`npx jgengine recipe` lists vetted compositions).",
    'Typed access to the same notes: `import { VERSION, CHANGELOG } from "@jgengine/core/meta/changelog"`.',
  );
  return lines.join("\n");
}
