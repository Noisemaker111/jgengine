/**
 * Every package a release publishes must already exist on npm and take trusted publishing (GitHub
 * Actions OIDC, no token or login). npm cannot create a package through trusted publishing, so a
 * renamed or new package stops the Publish workflow part-way: 0.56.0 published five packages, then
 * refused `@jgengine/ui`, which npm had never seen, and `latest` pointed at a core that depended on a
 * package that did not exist. This runs before anything is cut or published and refuses the whole
 * release instead.
 *
 * A package passes when the registry knows it and its `latest` version records a trusted publisher
 * (`_npmUser.trustedPublisher`), which npm writes only for an OIDC publish. Reading the registry needs
 * no credentials. A registry that cannot be read fails closed.
 *
 *   bun scripts/check-npm-trusted.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { publishListsFrom } from "./check-release-set";
import { printHelpIfAsked } from "./script-help";

const root = fileURLToPath(new URL("..", import.meta.url));

/** What a registry lookup returns: the status and, on 200, the packument. */
export type RegistryLookup = (name: string) => Promise<{ status: number; body?: unknown }>;

interface Packument {
  "dist-tags"?: Record<string, string>;
  versions?: Record<string, { _npmUser?: { trustedPublisher?: { id?: string } } }>;
}

/** Why `name` cannot be published by trusted publishing, or null when it can. */
export function trustedPublishProblem(name: string, status: number, body: unknown): string | null {
  if (status === 404) return `${name} is not on npm; trusted publishing cannot create a package, so publish it under a name npm already has`;
  if (status !== 200) return `${name}: the registry answered ${status}, so its publishing cannot be checked`;
  const packument = body as Packument;
  const latest = packument["dist-tags"]?.latest;
  if (latest === undefined) return `${name} has no latest version on npm`;
  const publisher = packument.versions?.[latest]?._npmUser?.trustedPublisher?.id;
  if (publisher !== "github") return `${name}@${latest} was not published by trusted publishing from GitHub Actions; set up its trusted publisher on npmjs.com first`;
  return null;
}

/** The problems with every name in `names`; empty when the release may publish them all. */
export async function trustedPublishProblems(names: readonly string[], lookup: RegistryLookup): Promise<string[]> {
  const problems = await Promise.all(names.map(async (name) => {
    try {
      const { status, body } = await lookup(name);
      return trustedPublishProblem(name, status, body);
    } catch (error) {
      return `${name}: the registry could not be read (${error instanceof Error ? error.message : String(error)})`;
    }
  }));
  return problems.filter((problem): problem is string => problem !== null);
}

/** The npm names of the packages the Publish workflow publishes, in its order. */
export function publishedPackageNames(): string[] {
  const lists = publishListsFrom(readFileSync(`${root}.github/workflows/publish.yml`, "utf8"));
  if (lists.length === 0) throw new Error("publish.yml has no `for p in ...; do` package list");
  return lists[0]!.map((folder) => (JSON.parse(readFileSync(`${root}packages/${folder}/package.json`, "utf8")) as { name: string }).name);
}

export const registryLookup: RegistryLookup = async (name) => {
  const response = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  return response.status === 200 ? { status: 200, body: await response.json() } : { status: response.status };
};

/** Logs the result; resolves true when every package can be published. */
export async function checkNpmTrusted(lookup: RegistryLookup = registryLookup): Promise<boolean> {
  const names = publishedPackageNames();
  const problems = await trustedPublishProblems(names, lookup);
  if (problems.length === 0) {
    console.log(`npm trusted publishing ok: ${names.length} packages exist on npm and take trusted publishing`);
    return true;
  }
  console.error(`npm trusted publishing: ${problems.length} package(s) cannot be published, so nothing is published:`);
  for (const problem of problems) console.error(`  ${problem}`);
  return false;
}

if (import.meta.main) {
  if (printHelpIfAsked("check-npm-trusted", {
    summary: "refuse a release unless every package it publishes exists on npm and takes trusted publishing",
    usage: "bun scripts/check-npm-trusted.ts",
    flags: [],
    example: "bun scripts/check-npm-trusted.ts",
  })) process.exit(0);
  process.exit((await checkNpmTrusted()) ? 0 : 1);
}
