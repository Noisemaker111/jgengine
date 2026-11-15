import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { isFile, resolveModulePath } from "./source";

/**
 * Where the engine is, seen from a game: the `@jgengine/*` packages it resolves (installed under
 * `node_modules`, or this monorepo's `packages/`), the file a public import path names, and the
 * proposal rules `@jgengine/core/meta/proposal` ships.
 */

/** `@jgengine/<pkg>` and the subpath after it (empty for the package root). */
export function splitEngineSpecifier(specifier: string): { pkg: string; subpath: string } | null {
  const match = /^@jgengine\/([^/]+)(?:\/(.+))?$/.exec(specifier);
  return match === null ? null : { pkg: match[1]!, subpath: match[2] ?? "" };
}

function packageName(dir: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name?: unknown };
    return typeof parsed.name === "string" ? parsed.name : null;
  } catch {
    return null;
  }
}

/** The folder of package `@jgengine/<pkg>` seen from `fromDir`: an installed copy, or the monorepo's own. */
export function enginePackageDir(pkg: string, fromDir: string): string | null {
  const name = `@jgengine/${pkg}`;
  let dir = fromDir;
  for (;;) {
    for (const candidate of [join(dir, "node_modules", "@jgengine", pkg), join(dir, "packages", pkg)]) {
      if (isFile(join(candidate, "package.json")) && packageName(candidate) === name) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Where an engine import path leads: the package folder, and the module file when one exists. */
export interface EngineModule {
  packageDir: string | null;
  file: string | null;
}

/**
 * The module file a public `@jgengine/...` import path names, from `fromDir`: the package's source
 * (`src/<subpath>`, as this monorepo and its games read it) or its built declarations
 * (`dist/<subpath>.d.ts`, as an installed package ships it).
 */
export function resolveEngineModule(specifier: string, fromDir: string): EngineModule {
  const split = splitEngineSpecifier(specifier);
  if (split === null) return { packageDir: null, file: null };
  const packageDir = enginePackageDir(split.pkg, fromDir);
  if (packageDir === null) return { packageDir, file: null };
  const sub = split.subpath === "" ? "index" : split.subpath;
  const file =
    resolveModulePath(join(packageDir, "src", sub)) ??
    (isFile(join(packageDir, "dist", `${sub}.d.ts`)) ? join(packageDir, "dist", `${sub}.d.ts`) : null) ??
    (split.subpath === "" ? null : resolveModulePath(join(packageDir, "dist", sub)));
  return { packageDir, file };
}

/** The engine repository root above `fromDir` (where `packages/core` is `@jgengine/core`), or null outside it. */
export function engineRepoRoot(fromDir: string): string | null {
  let dir = fromDir;
  for (;;) {
    if (packageName(join(dir, "packages", "core")) === "@jgengine/core") return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** The proposal rules the engine ships: one function, so the CLI and `defineEngineProposal` never disagree. */
export type ProposalRules = (value: unknown) => string[];

const RULES_MODULE = "@jgengine/core/meta/proposal";

/**
 * Load `engineProposalProblems` from `@jgengine/core/meta/proposal`: the copy beside this CLI, else
 * the one the project at `projectDir` installed. Null when neither exists (the project has no
 * `@jgengine/core`, which every proposal file imports).
 */
export async function loadProposalRules(projectDir: string): Promise<ProposalRules | null> {
  const attempts: (() => Promise<unknown>)[] = [
    () => import(RULES_MODULE),
    () => import(pathToFileURL(createRequire(join(projectDir, "package.json")).resolve(RULES_MODULE)).href),
  ];
  const repo = engineRepoRoot(projectDir);
  if (repo !== null) attempts.push(() => import(pathToFileURL(join(repo, "packages", "core", "src", "meta", "proposal.ts")).href));
  for (const attempt of attempts) {
    try {
      const loaded = (await attempt()) as { engineProposalProblems?: unknown };
      if (typeof loaded.engineProposalProblems === "function") return loaded.engineProposalProblems as ProposalRules;
    } catch {
      // try the next place the rules can live
    }
  }
  return null;
}
