import { existsSync, realpathSync } from "node:fs";
import { dirname, join, relative, isAbsolute } from "node:path";

import { findUp, readPackageJson } from "./pkg";

/** The running CLI: its package version, its package directory and the SDK line it was built for. */
export interface RunningCli {
  version: string;
  packageDir: string;
  sdkVersion: string;
}

function inside(child: string, parent: string): boolean {
  const rel = relative(safeReal(parent), safeReal(child));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function safeReal(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function minor(version: string | undefined): [number, number] | null {
  const match = /^[\^~]?(\d+)\.(\d+)/.exec(version ?? "");
  return match === null ? null : [Number(match[1]), Number(match[2])];
}

function newer(a: string | undefined, b: string | undefined): boolean {
  const x = minor(a);
  const y = minor(b);
  return x !== null && y !== null && (x[0] > y[0] || (x[0] === y[0] && x[1] > y[1]));
}

/**
 * Reasons the `jgengine` being run is probably not the one the caller meant, e.g. a stale global
 * install shadowing a jgengine checkout or a game's newer SDK. Version strings alone cannot catch
 * a global CLI that shares a version with a changed checkout, so location is checked too.
 */
export function staleCliWarnings(cwd: string, running: RunningCli): string[] {
  const warnings: string[] = [];
  const checkout = findUp(cwd, (dir) => readPackageJson(join(dir, "packages", "jgengine", "package.json"))?.name === "jgengine");
  if (checkout !== null && !inside(running.packageDir, checkout)) {
    const local = readPackageJson(join(checkout, "packages", "jgengine", "package.json"))?.version;
    warnings.push(
      `running jgengine ${running.version} from ${running.packageDir}, not this checkout's packages/jgengine (${local ?? "?"})` +
        ` — run bun run shoot/drive here, or node packages/jgengine/dist/cli/index.js`,
    );
  }
  const project = findUp(cwd, (dir) => existsSync(join(dir, "package.json")) && existsSync(join(dir, "node_modules")));
  if (project !== null) {
    const localCli = join(project, "node_modules", "jgengine");
    const localVersion = readPackageJson(join(localCli, "package.json"))?.version;
    if (localVersion !== undefined && !inside(running.packageDir, localCli)) {
      warnings.push(`this project installs jgengine ${localVersion} but ${running.packageDir} (${running.version}) is running — use npx jgengine / bunx jgengine`);
    }
    const core = readPackageJson(join(project, "node_modules", "@jgengine", "core", "package.json"))?.version;
    if (newer(core, running.sdkVersion)) {
      warnings.push(`this project uses @jgengine/core ${core}, newer than the SDK ${running.sdkVersion} this jgengine ${running.version} was built for — update the CLI (npm i -g jgengine@latest) or use npx jgengine`);
    }
  }
  return warnings;
}

/** The running CLI's own identity, read from the package that contains this module. */
export function runningCli(moduleDir: string, version: string, sdkVersion: string): RunningCli {
  const packageDir = findUp(moduleDir, (dir) => readPackageJson(join(dir, "package.json"))?.name === "jgengine") ?? dirname(moduleDir);
  return { version, packageDir, sdkVersion };
}
