/**
 * Published means present. For every `@jgengine/*` package at a version, the registry must
 * have metadata, the `dist.tarball` must return 200, the unpacked manifest must name that
 * version, every subpath the checkout exposes must resolve to a real file in the tarball,
 * and the main entry must `import()`.
 *
 *   bun run check:release-artifacts            # the checkout's own version
 *   bun run check:release-artifacts 0.35.0
 *   bun run check:release-artifacts 0.35.0 --only core,shell
 *   bun run check:release-artifacts --published @jgengine/shell@0.35.0
 *
 * `--published` exits 0 only when a consumer could install the package. The publish workflow
 * uses it in place of `npm view`, so metadata without a tarball counts as unpublished and is
 * republished instead of skipped (#2280).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { packageDir, publishedPackages, readManifest, repoRoot } from "./exportManifest";

export interface TarballResponse {
  status: number;
  bytes: Uint8Array | null;
}

export interface Registry {
  metadata(name: string): Promise<Record<string, unknown> | null>;
  tarball(url: string): Promise<TarballResponse>;
}

export interface UnpackedPackage {
  /** Directory holding the unpacked `package/` root. */
  dir: string;
  /** Package-relative paths, `/`-separated. */
  files: Set<string>;
  manifest: { name?: string; version?: string; exports?: Record<string, unknown> };
  cleanup?: () => void;
}

export type Unpack = (name: string, version: string, bytes: Uint8Array) => UnpackedPackage;

export interface PackageCheck {
  name: string;
  version: string;
  /** Subpaths the checkout exposes for this package; empty when the checkout is at another version. */
  declared?: readonly string[];
  registry: Registry;
  unpack: Unpack;
  importEntry?: (url: string) => Promise<unknown>;
}

export interface PackageVerdict {
  name: string;
  version: string;
  failures: string[];
  /** Facts that did not fail the check, such as a dependency this checkout has not installed. */
  notes: string[];
  checkedSubpaths: number;
}

const ENTRY_CONDITIONS = ["default", "import", "module", "require", "browser", "types"];

/** Every file target a conditional or array export value can resolve to. */
function leaves(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(leaves);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const named = ENTRY_CONDITIONS.filter((key) => typeof record[key] === "string").map((key) => record[key] as string);
    return named.length > 0 ? named : Object.values(record).flatMap(leaves);
  }
  return [];
}

const strip = (target: string): string => target.replace(/^\.\//, "");

/**
 * Package-relative target files a subpath resolves to under an exports map, following both
 * literal keys (`"./agents/system"`) and wildcard keys (`"./*"`). Empty means the map does not
 * expose the subpath at all.
 */
export function resolveExportTargets(exportsMap: Record<string, unknown> | undefined, subpath: string): string[] {
  if (exportsMap === undefined) return [];
  const exact = exportsMap[subpath];
  if (exact !== undefined) return [...new Set(leaves(exact).map(strip))];
  const targets: string[] = [];
  for (const [key, value] of Object.entries(exportsMap)) {
    const star = key.indexOf("*");
    if (star < 0) continue;
    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);
    if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue;
    const captured = subpath.slice(prefix.length, subpath.length - suffix.length);
    for (const leaf of leaves(value)) targets.push(strip(leaf.replace("*", captured)));
  }
  return [...new Set(targets)].sort();
}

/** The entry a consumer's bare `import "@scope/pkg"` would load, falling back to the first literal subpath. */
function mainEntryTargets(exportsMap: Record<string, unknown> | undefined, declared: readonly string[]): string[] {
  const direct = resolveExportTargets(exportsMap, ".");
  const candidates = direct.length > 0 ? direct : declared.flatMap((subpath) => resolveExportTargets(exportsMap, subpath));
  return candidates.filter((target) => /\.[cm]?js$/.test(target));
}

const failureLabel = (name: string, version: string): string => `${name}@${version}`;

export interface PublishedState {
  hasMetadata: boolean;
  hasVersion: boolean;
  /** HTTP status of the tarball, or null when the metadata names none. */
  tarballStatus: number | null;
}

/** What a consumer can actually install for one name and version. */
export async function publishedState(registry: Registry, name: string, version: string): Promise<PublishedState> {
  const metadata = await registry.metadata(name);
  if (metadata === null) return { hasMetadata: false, hasVersion: false, tarballStatus: null };
  const versions = (metadata.versions ?? {}) as Record<string, { dist?: { tarball?: string } }>;
  const entry = versions[version];
  if (entry === undefined) return { hasMetadata: true, hasVersion: false, tarballStatus: null };
  const url = entry.dist?.tarball;
  if (url === undefined || url === "") return { hasMetadata: true, hasVersion: true, tarballStatus: null };
  return { hasMetadata: true, hasVersion: true, tarballStatus: (await registry.tarball(url)).status };
}

/**
 * The publish workflow's skip guard. Metadata without a tarball is a repair, not a skip: `npm view`
 * reported success for a version whose tarball returned 404, so a re-run skipped it forever (#2280).
 */
export function publishDecision(state: PublishedState): "skip" | "publish" | "repair" {
  if (!state.hasMetadata || !state.hasVersion) return "publish";
  if (state.tarballStatus !== 200) return "repair";
  return "skip";
}

/**
 * Check one package against a registry. Every failure names the package and, where it applies,
 * the subpath that does not resolve.
 */
export async function checkPackage(input: PackageCheck): Promise<PackageVerdict> {
  const label = failureLabel(input.name, input.version);
  const verdict: PackageVerdict = { name: input.name, version: input.version, failures: [], notes: [], checkedSubpaths: 0 };
  const fail = (message: string): void => {
    verdict.failures.push(`${label}: ${message}`);
  };

  const metadata = await input.registry.metadata(input.name);
  if (metadata === null) {
    fail(`the registry has no metadata for ${input.name}`);
    return verdict;
  }
  const versions = (metadata.versions ?? {}) as Record<string, { dist?: { tarball?: string } }>;
  const entry = versions[input.version];
  if (entry === undefined) {
    const published = Object.keys(versions).slice(-3);
    fail(`${input.version} is not published${published.length > 0 ? ` (npm has ${published.join(", ")})` : ""}`);
    return verdict;
  }
  const url = entry.dist?.tarball;
  if (url === undefined || url === "") {
    fail("registry metadata has no dist.tarball, so nothing can be installed");
    return verdict;
  }
  const tarball = await input.registry.tarball(url);
  if (tarball.status !== 200 || tarball.bytes === null) {
    fail(`tarball ${url} returned ${tarball.status} - metadata without a tarball counts as unpublished`);
    return verdict;
  }

  let unpacked: UnpackedPackage;
  try {
    unpacked = input.unpack(input.name, input.version, tarball.bytes);
  } catch (error) {
    fail(`tarball ${url} did not unpack: ${message(error)}`);
    return verdict;
  }

  if (unpacked.manifest.name !== input.name) {
    fail(`the tarball's package.json names ${unpacked.manifest.name ?? "(nothing)"}, not ${input.name}`);
  }
  if (unpacked.manifest.version !== input.version) {
    fail(`the tarball's package.json says ${unpacked.manifest.version ?? "(no version)"}, so installing ${input.version} would report the wrong version`);
  }

  for (const subpath of input.declared ?? []) {
    const targets = resolveExportTargets(unpacked.manifest.exports, subpath);
    if (targets.length === 0) {
      fail(`${subpath} is exposed by the checkout but the published exports map does not declare it`);
      continue;
    }
    verdict.checkedSubpaths += 1;
    for (const target of targets) {
      if (!unpacked.files.has(target)) fail(`${subpath} resolves to ${target}, which the tarball does not contain`);
    }
  }

  const entryTarget = mainEntryTargets(unpacked.manifest.exports, input.declared ?? [])[0];
  if (entryTarget !== undefined && unpacked.files.has(entryTarget) && input.importEntry !== undefined) {
    try {
      await input.importEntry(pathToFileURL(join(unpacked.dir, "package", entryTarget)).href);
    } catch (error) {
      const dependency = unresolvableDependency(message(error));
      if (dependency !== null && declaredDependencies(unpacked.manifest).has(dependency)) {
        // A dependency this checkout has not installed is not a packaging defect.
        verdict.notes.push(`${label}: main entry ${entryTarget} needs declared dependency ${dependency}, which this checkout has not installed`);
      } else {
        fail(`main entry ${entryTarget} failed to import: ${message(error)}`);
      }
    }
  }
  unpacked.cleanup?.();
  return verdict;
}

/** The package name in a resolution error, so a missing dependency is not mistaken for a broken tarball. */
export function unresolvableDependency(text: string): string | null {
  const match = /Cannot find (?:package|module) '([^']+)'|resolving package '([^']+)'/.exec(text);
  const name = match?.[1] ?? match?.[2];
  if (name === undefined) return null;
  const parts = name.split("/");
  return name.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

function declaredDependencies(manifest: UnpackedPackage["manifest"]): Set<string> {
  const record = manifest as unknown as Record<string, unknown>;
  const names = new Set<string>();
  for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    const deps = record[field];
    if (deps !== null && typeof deps === "object") for (const name of Object.keys(deps)) names.add(name);
  }
  return names;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Registry metadata for a name, or null when the registry does not know it. */
export async function fetchMetadata(name: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${name}: registry metadata returned ${response.status}`);
  return (await response.json()) as Record<string, unknown>;
}

export async function fetchTarball(url: string): Promise<TarballResponse> {
  const response = await fetch(url);
  if (!response.ok) return { status: response.status, bytes: null };
  return { status: response.status, bytes: new Uint8Array(await response.arrayBuffer()) };
}

export const liveRegistry: Registry = { metadata: fetchMetadata, tarball: fetchTarball };

/** Unpack a tarball with the system `tar`, using paths relative to its own directory so Windows drive letters never reach it. */
export function unpackWithTar(name: string, version: string, bytes: Uint8Array): UnpackedPackage {
  // Inside the checkout, so `import()` resolves peer dependencies through the repository's
  // node_modules the way a consumer's install would.
  const scratch = join(repoRoot, ".scratch", "release-artifacts");
  mkdirSync(scratch, { recursive: true });
  const work = mkdtempSync(join(scratch, `${name.replace(/[^a-z0-9]+/gi, "-")}-${version}-`));
  const archive = "package.tgz";
  const extract = "extract";
  writeFileSync(join(work, archive), bytes);
  mkdirSync(join(work, extract));
  execFileSync("tar", ["-xzf", archive, "-C", extract], { cwd: work, timeout: 120_000 });
  const dir = join(work, extract);
  const files = readdirSync(join(dir, "package"), { recursive: true })
    .map((entry) => String(entry).split("\\").join("/"))
    .filter((entry) => !entry.endsWith("/"));
  const manifest = JSON.parse(readFileSync(join(dir, "package", "package.json"), "utf8")) as UnpackedPackage["manifest"];
  return { dir, files: new Set(files), manifest, cleanup: () => rmSync(work, { recursive: true, force: true }) };
}

export interface LocalPackage {
  dir: string;
  name: string;
  version: string;
}
function localPackages(only: ReadonlySet<string>): LocalPackage[] {
  const packages: LocalPackage[] = [];
  for (const pkg of publishedPackages) {
    if (only.size > 0 && !only.has(pkg)) continue;
    const manifest = JSON.parse(readFileSync(join(packageDir(pkg), "package.json"), "utf8")) as {
      name: string;
      version: string;
    };
    packages.push({ dir: packageDir(pkg), name: manifest.name, version: manifest.version });
  }
  return packages;
}

/**
 * Check every published package at `version`. A package the checkout holds at another version
 * (`@jgengine/github` and the `jgengine` CLI release on their own cadence) is checked at the
 * version the checkout actually ships, so the result is always "what a consumer can install".
 */
export async function checkReleaseArtifacts(options: {
  version: string;
  packages: readonly LocalPackage[];
  manifest: Record<string, readonly string[]>;
  registry: Registry;
  unpack: Unpack;
  importEntry?: (url: string) => Promise<unknown>;
}): Promise<PackageVerdict[]> {
  return Promise.all(
    options.packages.map((pkg) => {
      const version = pkg.version === options.version ? options.version : pkg.version;
      return checkPackage({
        name: pkg.name,
        version,
        declared: pkg.version === options.version ? (options.manifest[pkg.name] ?? []) : [],
        registry: options.registry,
        unpack: options.unpack,
        importEntry: options.importEntry,
      });
    }),
  );
}

function argValue(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const only = new Set((argValue(args, "--only") ?? "").split(",").filter(Boolean));
  const packages = localPackages(only);
  const unpack = unpackWithTar;
  const importer = (url: string): Promise<unknown> => import(url);

  const published = argValue(args, "--published");
  const plan = argValue(args, "--plan");
  if (published !== undefined || plan !== undefined) {
    const spec = (published ?? plan)!;
    const at = spec.lastIndexOf("@");
    const name = spec.slice(0, at);
    const version = spec.slice(at + 1);
    const state = await publishedState(liveRegistry, name, version);
    const decision = publishDecision(state);
    if (plan !== undefined) {
      console.log(decision);
      return;
    }
    if (decision === "skip") {
      console.log(`present ${name}@${version}`);
      return;
    }
    console.error(
      `${name}@${version}: ${decision === "publish" ? "unpublished" : "metadata is present but the tarball is not"} (tarball status ${state.tarballStatus ?? "none"})`,
    );
    process.exit(1);
  }

  const version = args.find((arg) => /^\d+\.\d+\.\d+/.test(arg)) ?? packages[0]?.version;
  if (version === undefined) {
    console.error("check-release-artifacts: no version given and no packages to read one from");
    process.exit(2);
  }

  const verdicts = await checkReleaseArtifacts({
    version,
    packages,
    manifest: readManifest(),
    registry: liveRegistry,
    unpack,
    importEntry: importer,
  });

  const failures = verdicts.flatMap((verdict) => verdict.failures);
  if (failures.length > 0) {
    console.error(`check-release-artifacts failed at ${version}:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  for (const note of verdicts.flatMap((verdict) => verdict.notes)) console.log(`note: ${note}`);
  const subpaths = verdicts.reduce((total, verdict) => total + verdict.checkedSubpaths, 0);
  console.log(`check-release-artifacts ok: ${verdicts.length} package(s) install from the registry and resolve ${subpaths} declared subpath(s) (${verdicts.map((v) => `${v.name}@${v.version}`).join(", ")})`);
}

if (import.meta.main) await main();
