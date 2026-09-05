/**
 * Every `@jgengine/*` package a published package depends on must itself be published, and earlier
 * in the publish order. `@jgengine/editor@0.18.1` shipped depending on `@jgengine/navbake`, which no
 * list included, so no external consumer could install the SDK (#1752). The publish workflow, the
 * version bumper, and the release changelog bullet each carry their own copy of the set; this check
 * reads all three and the package manifests so they cannot drift apart again.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(`${root}${rel}`, "utf8");

export interface ReleaseSetReport {
  publishOrder: string[];
  failures: string[];
}

/** The `for p in …; do` package lists in the publish workflow; every list must agree. */
export function publishListsFrom(workflow: string): string[][] {
  return [...workflow.matchAll(/for p in ([a-z0-9 ]+); do/g)].map((match) => match[1]!.trim().split(/\s+/));
}

/** `const PACKAGES = [...]` in set-version.ts. */
export function versionPackagesFrom(source: string): string[] {
  const match = /const PACKAGES = \[([^\]]+)\]/.exec(source);
  if (!match) throw new Error("set-version.ts has no `const PACKAGES = [...]`");
  return [...match[1]!.matchAll(/"([a-z0-9]+)"/g)].map((entry) => entry[1]!);
}

/** The `@jgengine/{a,b,c}` set named in the release lockstep bullet. */
export function lockstepSetFrom(source: string): string[] {
  const match = /@jgengine\/\{([a-z0-9,]+)\}/.exec(source);
  if (!match) throw new Error("no `@jgengine/{...}` lockstep set found");
  return match[1]!.split(",");
}

/**
 * Checks one publish order against the manifests: every workspace dependency of a listed package is
 * listed, and listed before its dependent. `manifests` maps directory name to its parsed package.json.
 */
export function checkPublishOrder(
  publishOrder: readonly string[],
  manifests: ReadonlyMap<string, { name: string; dependencies?: Record<string, string>; peerDependencies?: Record<string, string> }>,
): string[] {
  const failures: string[] = [];
  const dirByName = new Map([...manifests].map(([dir, manifest]) => [manifest.name, dir]));
  const position = new Map(publishOrder.map((dir, index) => [dir, index]));
  for (const dir of publishOrder) {
    const manifest = manifests.get(dir);
    if (manifest === undefined) {
      failures.push(`publish list names "${dir}" but packages/${dir}/package.json does not exist`);
      continue;
    }
    for (const dep of Object.keys(manifest.dependencies ?? {})) {
      if (!dep.startsWith("@jgengine/")) continue;
      const depDir = dirByName.get(dep);
      if (depDir === undefined) {
        failures.push(`${manifest.name} depends on ${dep}, which is not a workspace package`);
        continue;
      }
      const depIndex = position.get(depDir);
      if (depIndex === undefined) {
        failures.push(`${manifest.name} depends on ${dep} (packages/${depDir}), which is not in the publish list — consumers cannot install it`);
      } else if (depIndex > position.get(dir)!) {
        failures.push(`${dep} must publish before ${manifest.name}; it is listed after`);
      }
    }
  }
  return failures;
}

export function checkReleaseSet(): ReleaseSetReport {
  const failures: string[] = [];
  const lists = publishListsFrom(read(".github/workflows/publish.yml"));
  if (lists.length === 0) failures.push("publish.yml has no `for p in …` package list");
  const publishOrder = lists[0] ?? [];
  for (const list of lists.slice(1)) {
    if (list.join(" ") !== publishOrder.join(" ")) failures.push(`publish.yml package lists disagree: "${publishOrder.join(" ")}" vs "${list.join(" ")}"`);
  }
  const versioned = versionPackagesFrom(read("scripts/set-version.ts"));
  const missingFromVersion = publishOrder.filter((dir) => !versioned.includes(dir));
  const extraInVersion = versioned.filter((dir) => !publishOrder.includes(dir));
  if (missingFromVersion.length > 0) failures.push(`set-version.ts PACKAGES lacks published package(s): ${missingFromVersion.join(", ")}`);
  if (extraInVersion.length > 0) failures.push(`set-version.ts PACKAGES bumps unpublished package(s): ${extraInVersion.join(", ")}`);

  const manifests = new Map<string, { name: string; dependencies?: Record<string, string> }>();
  for (const dir of readdirSync(`${root}packages`)) {
    const path = `packages/${dir}/package.json`;
    if (existsSync(`${root}${path}`)) manifests.set(dir, JSON.parse(read(path)));
  }
  failures.push(...checkPublishOrder(publishOrder, manifests));

  const separateCadence = new Set(["jgengine", "github"]);
  const lockstepExpected = publishOrder.filter((dir) => !separateCadence.has(dir)).sort();
  for (const [label, source] of [
    ["scripts/release.ts", read("scripts/release.ts")],
    ["README.md", read("README.md")],
  ] as const) {
    const named = lockstepSetFrom(source).sort();
    if (named.join(",") !== lockstepExpected.join(",")) {
      failures.push(`${label} lockstep set is {${named.join(",")}} but the publish list implies {${lockstepExpected.join(",")}}`);
    }
  }
  return { publishOrder, failures };
}

if (import.meta.main) {
  const report = checkReleaseSet();
  if (report.failures.length > 0) {
    console.error("check-release-set failed:");
    for (const failure of report.failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`check-release-set ok: ${report.publishOrder.length} packages publish in dependency order (${report.publishOrder.join(" ")})`);
}
