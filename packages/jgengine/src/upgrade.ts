import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { cliVersion, findUp, hasFlag, readPackageJson } from "./pkg";

/** Lockstep SDK packages (everything under @jgengine/* except the CLI and @jgengine/github). */
const LOCKSTEP_PACKAGES = [
  "@jgengine/core",
  "@jgengine/react",
  "@jgengine/shell",
  "@jgengine/ws",
  "@jgengine/sql",
  "@jgengine/convex",
  "@jgengine/node",
  "@jgengine/assets",
  "@jgengine/editor",
];

const CHANGELOG_URL = "https://raw.githubusercontent.com/Noisemaker111/jgengine/main/CHANGELOG.md";
const REGISTRY_LATEST_URL = "https://registry.npmjs.org/@jgengine%2fcore/latest";
const FETCH_TIMEOUT_MS = 8000;

export interface ReleaseNotes {
  version: string;
  migrate: string[];
  added: string[];
  changed: string[];
  removed: string[];
}

export interface InstalledPackage {
  name: string;
  declared: string;
  installed: string | null;
}

/** Parse CHANGELOG.md (Keep a Changelog shape: `## x.y.z` + `### Migrate/Added/Changed/Removed`). */
export function parseChangelogMarkdown(markdown: string): ReleaseNotes[] {
  const releases: ReleaseNotes[] = [];
  let release: ReleaseNotes | null = null;
  let bucket: string[] | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const versionMatch = /^## (\d+\.\d+\.\d+)\s*$/.exec(line);
    if (versionMatch !== null) {
      release = { version: versionMatch[1], migrate: [], added: [], changed: [], removed: [] };
      releases.push(release);
      bucket = null;
      continue;
    }
    if (release === null) continue;
    const sectionMatch = /^### (\w+)/.exec(line);
    if (sectionMatch !== null) {
      const section = sectionMatch[1].toLowerCase();
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

/** Releases strictly after `installed` up to and including `latest`, oldest first (migrate order). */
export function releasesBetween(releases: ReleaseNotes[], installed: string, latest: string): ReleaseNotes[] {
  return releases
    .filter((entry) => compareSemver(entry.version, installed) > 0 && compareSemver(entry.version, latest) <= 0)
    .sort((a, b) => compareSemver(a.version, b.version));
}

/** @internal */
export function collectInstalled(projectDir: string): InstalledPackage[] {
  const pkg = readPackageJson(join(projectDir, "package.json"));
  return Object.entries({ ...pkg?.dependencies, ...pkg?.devDependencies })
    .filter(([name]) => LOCKSTEP_PACKAGES.includes(name))
    .map(([name, declared]) => ({
      name,
      declared,
      installed: readPackageJson(join(projectDir, "node_modules", name, "package.json"))?.version ?? null,
    }));
}

/** Lowest installed lockstep version — the safe baseline for the migrate span. */
export function baselineVersion(packages: InstalledPackage[]): string | null {
  const versions = packages
    .map((entry) => entry.installed ?? entry.declared.replace(/^[\^~]/, ""))
    .filter((version) => /^\d+\.\d+\.\d+$/.test(version));
  if (versions.length === 0) return null;
  return versions.sort(compareSemver)[0];
}

interface ChangelogModule {
  VERSION?: string;
  CHANGELOG?: Record<string, { migrate: readonly string[]; added: readonly string[]; changed: readonly string[]; removed: readonly string[] }>;
}

/** Typed changelog from the project's installed @jgengine/core, if resolvable. */
async function loadInstalledChangelog(projectDir: string): Promise<ReleaseNotes[] | null> {
  try {
    const require = createRequire(join(projectDir, "package.json"));
    const resolved = require.resolve("@jgengine/core/meta/changelog");
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

async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/** Render the human report: per-package status, then per-release Migrate → Adopt → Changed → Removed. */
export function renderUpgradeReport(
  packages: InstalledPackage[],
  installed: string,
  latest: string,
  releases: ReleaseNotes[],
  source: string,
): string {
  const lines: string[] = [];
  lines.push(`jgengine upgrade — installed ${installed}, latest ${latest} (notes: ${source})`);
  for (const entry of packages) {
    lines.push(`  ${entry.name}  declared ${entry.declared}  installed ${entry.installed ?? "(not installed)"}`);
  }
  if (releases.length === 0) {
    lines.push("");
    lines.push("Up to date — no releases to cross. Nothing to migrate or adopt.");
    return lines.join("\n");
  }
  for (const release of releases) {
    lines.push("");
    lines.push(`## ${release.version}`);
    if (release.migrate.length > 0) {
      lines.push("Migrate (do these, in order):");
      for (const item of release.migrate) lines.push(`  - ${item}`);
    }
    if (release.added.length > 0) {
      lines.push("Adopt (new capability — consider wiring these into the game):");
      for (const item of release.added) lines.push(`  - ${item}`);
    }
    if (release.changed.length > 0) {
      lines.push("Changed:");
      for (const item of release.changed) lines.push(`  - ${item}`);
    }
    if (release.removed.length > 0) {
      lines.push("Removed:");
      for (const item of release.removed) lines.push(`  - ${item}`);
    }
  }
  lines.push("");
  lines.push(`Next: bump every @jgengine/* pin to ^${latest}, reinstall, rebuild, and run the Migrate steps oldest-first.`);
  lines.push(
    "Then work the Adopt lists: replace hand-rolled glue with the new primitives (`npx jgengine recipe` lists vetted compositions).",
  );
  lines.push('Typed access to the same data: `import { VERSION, CHANGELOG } from "@jgengine/core/meta/changelog"`.');
  return lines.join("\n");
}

/**
 * `jgengine upgrade [dir] [--json]` — diff the project's installed @jgengine/* versions against the
 * latest release and print every Migrate step and Adopt-worthy addition in between.
 */
export async function runUpgrade(argv: string[]): Promise<number> {
  const dirArg = argv.find((arg) => !arg.startsWith("-"));
  const startDir = resolve(dirArg ?? process.cwd());
  const projectDir = findUp(startDir, (dir) => existsSync(join(dir, "package.json")));
  if (projectDir === null) {
    console.error("error: no package.json found — run inside a game project");
    return 1;
  }
  const packages = collectInstalled(projectDir);
  if (packages.length === 0) {
    console.error(`error: no @jgengine/* dependencies in ${join(projectDir, "package.json")}`);
    return 1;
  }
  const installed = baselineVersion(packages);
  if (installed === null) {
    console.error("error: could not resolve an installed @jgengine/* version — run install first");
    return 1;
  }

  const [registryJson, remoteMarkdown, localChangelog] = await Promise.all([
    fetchText(REGISTRY_LATEST_URL),
    fetchText(CHANGELOG_URL),
    loadInstalledChangelog(projectDir),
  ]);

  const remoteReleases = remoteMarkdown === null ? null : parseChangelogMarkdown(remoteMarkdown);
  const releases = remoteReleases !== null && remoteReleases.length > 0 ? remoteReleases : (localChangelog ?? []);
  const source = remoteReleases !== null && remoteReleases.length > 0 ? "published CHANGELOG.md" : "installed @jgengine/core (may lag — check network)";

  let latest: string | null = null;
  if (registryJson !== null) {
    try {
      const parsed = JSON.parse(registryJson) as { version?: string };
      if (typeof parsed.version === "string") latest = parsed.version;
    } catch {
      latest = null;
    }
  }
  if (latest === null) latest = releases.map((entry) => entry.version).sort(compareSemver).at(-1) ?? null;
  if (latest === null) {
    console.error("error: could not determine the latest @jgengine version (registry and changelog both unreachable)");
    return 1;
  }

  const span = releasesBetween(releases, installed, latest);

  if (hasFlag(argv, "json")) {
    console.log(
      JSON.stringify(
        { cli: cliVersion(), installed, latest, upToDate: span.length === 0, packages, releases: span, notesSource: source },
        null,
        2,
      ),
    );
    return 0;
  }
  console.log(renderUpgradeReport(packages, installed, latest, span, source));
  return 0;
}
