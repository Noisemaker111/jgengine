import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { cliVersion, findUp, hasFlag, readPackageJson, resolveDependencyRange } from "./pkg";
import { inspectInstalledPackageVersion, LOCKSTEP_SDK_PACKAGES } from "./compatibility";
import { applyCatalogUpgrade, loadUpgradeCatalog, planCatalogUpgrade, type UpgradeCatalog } from "./upgradeCatalog";

const CHANGELOG_URL = "https://raw.githubusercontent.com/Noisemaker111/jgengine/main/CHANGELOG.md";
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
  resolvedDeclared?: string | null;
  catalogSource?: string;
  resolutionError?: string;
  installationError?: string;
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
  const file = join(projectDir, "package.json");
  const pkg = readPackageJson(file);
  if (pkg === null || typeof pkg !== "object" || Array.isArray(pkg)) throw new Error(`${file}: invalid package.json object`);
  for (const field of ["dependencies", "devDependencies"] as const) {
    const values = pkg[field];
    if (values !== undefined && (values === null || typeof values !== "object" || Array.isArray(values))) throw new Error(`${file}: ${field} must be an object`);
  }
  return Object.entries({ ...pkg?.dependencies, ...pkg?.devDependencies })
    .filter(([name]) => LOCKSTEP_SDK_PACKAGES.includes(name))
    .map(([name, declared]) => {
      if (typeof declared !== "string" || declared.trim() === "") throw new Error(`${name}: missing or malformed dependency declaration`);
      const resolution = resolveDependencyRange(projectDir, name, declared);
      const installation = inspectInstalledPackageVersion(projectDir, name);
      return {
        name,
        declared,
        installed: installation.version,
        ...(installation.error === undefined ? {} : { installationError: installation.error }),
        ...(declared.startsWith("catalog:") ? {
          resolvedDeclared: resolution.range,
          catalogSource: resolution.catalogSource,
          resolutionError: resolution.error,
        } : {}),
      };
    });
}

/** Lowest installed or resolved declared SDK version, used as the migration baseline. */
export function baselineVersion(packages: InstalledPackage[]): string | null {
  if (packages.some(entry => entry.resolutionError !== undefined || entry.installationError !== undefined)) return null;
  const versions = packages
    .map((entry) => entry.installed ?? (entry.resolvedDeclared ?? entry.declared).replace(/^[\^~]/, ""))
    .filter((version) => /^\d+\.\d+\.\d+$/.test(version));
  if (versions.length === 0) return null;
  return versions.sort(compareSemver)[0];
}

function matchesTarget(packages: InstalledPackage[], target: string): boolean {
  return packages.every(entry => (entry.installed ?? (entry.resolvedDeclared ?? entry.declared).replace(/^[\^~]/, "")) === target);
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
  baselinePackages: InstalledPackage[] = packages,
): string {
  const lines: string[] = [];
  const baseline = baselinePackages.every(entry => entry.installed === null) ? "declared baseline"
    : baselinePackages.some(entry => entry.installed === null) ? "mixed baseline" : "installed";
  lines.push(`jgengine upgrade — ${baseline} ${installed}, latest ${latest} (notes: ${source})`);
  for (const entry of packages) {
    const resolution = entry.catalogSource === undefined ? "" : ` → ${entry.resolvedDeclared ?? "(unresolved)"} (${entry.catalogSource})`;
    lines.push(`  ${entry.name}  declared ${entry.declared}${resolution}  installed ${entry.installed ?? "(not installed)"}`);
  }
  if (releases.length === 0) {
    lines.push("");
    lines.push(compareSemver(installed, latest) === 0
      ? matchesTarget(baselinePackages, latest)
        ? "Up to date — no releases to cross. Nothing to migrate or adopt."
        : `SDK versions differ from target ${latest}; review the per-package versions before adoption.`
      : compareSemver(installed, latest) > 0
        ? `Baseline ${installed} is newer than target ${latest}; no downgrade is proposed.`
        : `Target ${latest} is newer, but no migration notes were found for this span. Review the release notes before adoption.`);
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
  const catalogs = [...new Set(packages.flatMap(entry => entry.catalogSource === undefined ? [] : [entry.catalogSource]))];
  lines.push(catalogs.length === 0
    ? `Next: bump every @jgengine/* pin to ^${latest}, reinstall, rebuild, and run the Migrate steps oldest-first. CLI and github keep their own versions.`
    : `Next: review SDK pins for ${latest} in ${catalogs.join(", ")}${packages.some(entry => entry.catalogSource === undefined) ? " and the project's direct SDK declarations" : ""}, reinstall, rebuild, and run the Migrate steps oldest-first.`);
  lines.push(
    "Then work the Adopt lists: replace hand-rolled glue with the new primitives (`npx jgengine recipe` lists vetted compositions).",
  );
  lines.push('Typed access to the same data: `import { VERSION, CHANGELOG } from "@jgengine/core/meta/changelog"`.');
  return lines.join("\n");
}

const UPGRADE_USAGE = "jgengine upgrade [dir] [--json] [--to x.y.z] [--plan | --apply]";
const STABLE_VERSION = /^\d+\.\d+\.\d+$/;

function parseUpgradeArgs(argv: string[]): { dir?: string; target?: string; json: boolean; plan: boolean; apply: boolean } {
  const options = { dir: undefined as string | undefined, target: undefined as string | undefined, json: false, plan: false, apply: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--plan") options.plan = true;
    else if (arg === "--apply") options.apply = true;
    else if (arg === "--to") {
      const target = argv[++index];
      if (target === undefined || !STABLE_VERSION.test(target)) throw new Error("--to requires a stable x.y.z published version");
      options.target = target;
    } else if (arg.startsWith("-")) throw new Error(`unknown upgrade flag ${arg}; ${UPGRADE_USAGE}`);
    else if (options.dir !== undefined) throw new Error(`unexpected argument ${arg}; ${UPGRADE_USAGE}`);
    else options.dir = arg;
  }
  if (options.plan && options.apply) throw new Error("choose --plan or --apply");
  return options;
}

interface RegistryPackage {
  version: string;
  dependencies?: Record<string, string>;
}

async function publishedPackage(name: string, version: string): Promise<RegistryPackage> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`;
  let response: Response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }); }
  catch { throw new Error(`${name}@${version}: registry request failed; no catalog changes made`); }
  if (!response.ok) throw new Error(`${name}@${version}: registry returned HTTP ${response.status}; no catalog changes made`);
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new Error(`${name}@${version}: invalid registry JSON`); }
  if (data === null || typeof data !== "object" || Array.isArray(data) || !("version" in data) || typeof data.version !== "string" || !STABLE_VERSION.test(data.version)) {
    throw new Error(`${name}@${version}: registry returned invalid version metadata`);
  }
  if (version !== "latest" && data.version !== version) throw new Error(`${name}@${version}: registry returned version ${data.version}`);
  return data as RegistryPackage;
}

function acceptsVersion(range: string, version: string): boolean {
  const match = /^([\^~]?)(\d+\.\d+\.\d+)$/.exec(range);
  if (match === null) return false;
  if (match[1] === "") return range === version;
  if (compareSemver(version, match[2]) < 0) return false;
  const [major, minor, patch] = match[2].split(".").map(Number);
  const [nextMajor, nextMinor, nextPatch] = version.split(".").map(Number);
  return nextMajor === major && (match[1] === "~" || major === 0 ? nextMinor === minor : true)
    && (match[1] === "^" && major === 0 && minor === 0 ? nextPatch === patch : true);
}

async function verifyCatalogPublication(catalog: UpgradeCatalog, target: string): Promise<string[]> {
  const pending = new Map<string, { name: string; version: string }>();
  const checked = new Set<string>();
  for (const entry of catalog.entries) {
    if (entry.name === "@jgengine/editor" && entry.name in catalog.overrides) continue;
    pending.set(`${entry.name}@${target}`, { name: entry.name, version: target });
  }
  while (pending.size > 0) {
    const batch = [...pending.values()]; pending.clear();
    const packages = await Promise.all(batch.map(async entry => ({ ...entry, data: await publishedPackage(entry.name, entry.version) })));
    for (const entry of packages) checked.add(`${entry.name}@${entry.version}`);
    for (const entry of packages) {
      const dependencies = entry.data.dependencies;
      if (dependencies === undefined) continue;
      if (dependencies === null || typeof dependencies !== "object" || Array.isArray(dependencies)) throw new Error(`${entry.name}@${entry.version}: malformed registry dependencies`);
      for (const [name, range] of Object.entries(dependencies)) {
        if (!LOCKSTEP_SDK_PACKAGES.includes(name)) continue;
        const override = catalog.overrides[name];
        const version = typeof override === "string" ? override.replace(/^[\^~]/, "") : target;
        if (typeof range !== "string" || !STABLE_VERSION.test(version) || !acceptsVersion(range, version)) {
          throw new Error(`${entry.name}@${entry.version}: ${name} dependency ${String(range)} cannot resolve to ${version}; review the catalog or override`);
        }
        const key = `${name}@${version}`;
        if (!checked.has(key)) pending.set(key, { name, version });
      }
    }
  }
  return [...checked].sort();
}

/**
 * Report published SDK migrations. Opt-in catalog plans preserve game declarations;
 * apply writes the reviewed root manifest only, without running install or editing locks.
 */
export async function runUpgrade(argv: string[]): Promise<number> {
  if (hasFlag(argv, "help")) { console.log(UPGRADE_USAGE); return 0; }
  try {
    const options = parseUpgradeArgs(argv);
    const startDir = resolve(options.dir ?? process.cwd());
    const projectDir = findUp(startDir, dir => existsSync(join(dir, "package.json")));
    if (projectDir === null) throw new Error("no package.json found — run inside a game project or workspace");
    const authoring = options.plan || options.apply;
    const authoredCatalog = authoring ? loadUpgradeCatalog(projectDir) : null;
    const direct = collectInstalled(projectDir);
    const directErrors = direct.flatMap(entry => [entry.resolutionError, entry.installationError].filter((error): error is string => error !== undefined));
    if (directErrors.length > 0) throw new Error(directErrors.join("; "));
    const workspaces = readPackageJson(join(projectDir, "package.json"))?.workspaces;
    const rootReport = workspaces !== undefined && workspaces !== null && typeof workspaces === "object" && !Array.isArray(workspaces) && (workspaces.catalog !== undefined || workspaces.catalogs !== undefined);
    const catalog = authoredCatalog ?? (rootReport ? loadUpgradeCatalog(projectDir) : null);
    const packages: InstalledPackage[] = catalog === null ? direct : catalog.entries.map(entry => {
      const installation = inspectInstalledPackageVersion(catalog.root, entry.name);
      return {
        name: entry.name, declared: `catalog:${entry.catalogSource === "workspaces.catalog" ? "" : entry.catalogSource.slice("workspaces.catalogs.".length)}`,
        installed: installation.version, resolvedDeclared: entry.range,
        ...(installation.error === undefined ? {} : { installationError: installation.error }),
        catalogSource: `${catalog.file} ${entry.catalogSource}`,
      };
    });
    if (packages.length === 0) throw new Error(`no @jgengine/* dependencies in ${join(projectDir, "package.json")}`);
    const errors = packages.flatMap(entry => [entry.resolutionError, entry.installationError].filter((error): error is string => error !== undefined));
    if (errors.length > 0) throw new Error(errors.join("; "));
    for (const entry of [...packages, ...direct]) {
      const declared = entry.resolvedDeclared ?? entry.declared;
      if (entry.installed === null && !/^[\^~]?\d+\.\d+\.\d+$/.test(declared)) throw new Error(`${entry.name}: unsupported current declaration ${declared}; resolve a stable SDK baseline first`);
      if (entry.installed !== null && !STABLE_VERSION.test(entry.installed)) throw new Error(`${entry.name}: unsupported installed version ${entry.installed}; stable SDK versions are required`);
    }
    const baselinePackages = catalog === null ? packages : [...packages, ...direct];
    const installed = baselineVersion(baselinePackages);
    if (installed === null) throw new Error("could not resolve an installed or declared stable SDK baseline — check declarations and install");
    const [registry, remoteMarkdown, localChangelog] = await Promise.all([
      publishedPackage("@jgengine/core", options.target ?? "latest").then(data => ({ data, error: null })).catch((error: unknown) => ({ data: null, error: error instanceof Error ? error.message : String(error) })),
      fetchText(CHANGELOG_URL), loadInstalledChangelog(catalog?.root ?? projectDir),
    ]);
    const remoteReleases = remoteMarkdown === null ? null : parseChangelogMarkdown(remoteMarkdown);
    const releases = remoteReleases !== null && remoteReleases.length > 0 ? remoteReleases : (localChangelog ?? []);
    const source = remoteReleases !== null && remoteReleases.length > 0 ? "published CHANGELOG.md" : "installed @jgengine/core (may lag — check network)";
    if ((authoring || options.target !== undefined) && registry.data === null) throw new Error(registry.error ?? "could not verify a published SDK target");
    const target = registry.data?.version ?? releases.map(entry => entry.version).sort(compareSemver).at(-1) ?? null;
    if (target === null) throw new Error("could not determine the latest @jgengine version (registry and changelog both unreachable)");
    const span = releasesBetween(releases, installed, target);
    const plan = !authoring || catalog === null ? null : planCatalogUpgrade(catalog, target);
    const verified = !authoring || catalog === null ? [] : await verifyCatalogPublication(catalog, target);
    const directDeclarations = authoring ? direct.filter(entry => !entry.declared.startsWith("catalog:")) : [];
    const warnings = [
      ...(directDeclarations.length > 0 ? [`Direct SDK declarations are unchanged: ${directDeclarations.map(entry => `${entry.name} ${entry.declared}`).join(", ")}. This plan edits workspace catalogs only.`] : []),
      ...(registry.data === null ? [registry.error ?? "Registry unavailable: the notes target is not verified as published."] : []),
      ...(compareSemver(installed, target) < 0 && !releases.some(entry => entry.version === target) ? [`Migration notes for ${target} are unavailable; review them before adopting the target.`] : []),
    ];
    const report = {
      cli: cliVersion(), installed, latest: options.target === undefined ? target : null, target, targetSource: registry.data === null ? "notes-only-unverified" : "registry",
      baselineSource: baselinePackages.every(entry => entry.installed === null) ? "declared" : baselinePackages.some(entry => entry.installed === null) ? "mixed" : "installed",
      upToDate: matchesTarget(baselinePackages, target), packages, ...(catalog === null ? {} : { projectPackages: direct }), releases: span, notesSource: source, warnings,
      ...(plan === null ? {} : { plan, verifiedPublished: verified, directDeclarationsUnchanged: directDeclarations, installation: "not-run", lockfiles: "unchanged", applyRequested: options.apply }),
    };
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else {
      const rendered = renderUpgradeReport(packages, installed, target, span, source, baselinePackages);
      console.log(options.target === undefined ? rendered : rendered.replace(", latest ", ", target "));
      for (const warning of warnings) console.log(`Warning: ${warning}`);
      if (plan !== null) {
        console.log(`\nCatalog plan: ${plan.file}`);
        for (const entry of plan.changes) console.log(`  ${entry.catalogSource}.${entry.name}: ${entry.from} → ${entry.to}`);
        for (const entry of plan.preserved) console.log(`  Held ${entry.name} ${entry.range}: ${entry.reason}`);
        console.log("Install has not run. Existing installed versions and lockfiles are unchanged.");
      }
    }
    if (options.apply && plan !== null) {
      applyCatalogUpgrade(plan);
      console.error(plan.changes.length === 0 ? "Catalog declarations already match; install has not run." : `Updated declarations in ${plan.file}; install has not run. Run install at the workspace root, then rebuild, migrate, and verify each game.`);
    }
    return 0;
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
