// Builds @jgengine/core, @jgengine/react and @jgengine/shell as one program. A feature folder in core
// holds its React view and three.js draw files, so the three packages import each other and no
// package-by-package order exists. Each package's tsconfig.build.json still names what it emits; this
// compiles their union once and moves each package's slice into its own dist/.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { printHelpIfAsked } from "./script-help";

/** The packages that compile together, in the order their dist/ folders are written. */
export const ENGINE_PACKAGES = ["core", "react", "shell"] as const;

interface BuildConfig {
  include?: string[];
  exclude?: string[];
}

/** The one-program tsconfig: every engine package's include/exclude, rooted at `packages/`. */
export function engineBuildConfig(root: string, outDir: string, configDir: string): object {
  const include: string[] = [];
  const exclude: string[] = [];
  const rel = (path: string) => relative(configDir, join(root, path)).replace(/\\/g, "/");
  for (const pkg of ENGINE_PACKAGES) {
    const config = JSON.parse(readFileSync(join(root, "packages", pkg, "tsconfig.build.json"), "utf8")) as BuildConfig;
    for (const pattern of config.include ?? ["src"]) include.push(rel(`packages/${pkg}/${pattern}`));
    for (const pattern of config.exclude ?? []) exclude.push(rel(`packages/${pkg}/${pattern}`));
  }
  return {
    extends: rel("tsconfig.base.json"),
    compilerOptions: {
      lib: ["ES2022", "DOM", "WebWorker"],
      jsx: "react-jsx",
      noEmit: false,
      declaration: true,
      outDir: relative(configDir, outDir).replace(/\\/g, "/"),
      rootDir: rel("packages"),
    },
    include,
    exclude,
  };
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Relative specifiers in a package's emitted files that climb out of that package. */
export function escapingSpecifiers(distDir: string): string[] {
  const pkgDir = dirname(distDir);
  const found: string[] = [];
  for (const file of walk(distDir)) {
    if (!/\.(js|d\.ts)$/.test(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/(?:from\s*|import\s*\(\s*)["'](\.\.?\/[^"']+)["']/g)) {
      const target = resolve(dirname(file), match[1]!);
      if (relative(pkgDir, target).startsWith("..")) found.push(`${relative(distDir, file)}: ${match[1]}`);
    }
  }
  return found;
}

function run(command: string[], cwd: string): void {
  const result = spawnSync(command[0]!, command.slice(1), { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    console.error(`build-engine: ${command.join(" ")} exited ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

function main(): void {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const work = join(root, ".scratch", "engine-build");
  const out = join(work, "out");
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const configPath = join(work, "tsconfig.json");
  writeFileSync(configPath, `${JSON.stringify(engineBuildConfig(root, out, work), null, 2)}\n`);
  run(["bun", "x", "tsgo", "-p", configPath], root);
  for (const pkg of ENGINE_PACKAGES) {
    const emitted = join(out, pkg, "src");
    if (!existsSync(emitted)) {
      console.error(`build-engine: nothing emitted for ${pkg}`);
      process.exit(1);
    }
    const dist = join(root, "packages", pkg, "dist");
    rmSync(dist, { recursive: true, force: true });
    renameSync(emitted, dist);
    const escaping = escapingSpecifiers(dist);
    if (escaping.length > 0) {
      console.error(`build-engine: ${pkg} dist imports outside itself (use @jgengine/<pkg>/… across packages):\n  ${escaping.join("\n  ")}`);
      process.exit(1);
    }
    run(["bun", join(root, "scripts", "fix-extensions.ts"), dist], root);
  }
  run(["bun", join(root, "packages", "react", "scripts", "styles.ts")], root);
  rmSync(work, { recursive: true, force: true });
  console.log(`build-engine: built ${ENGINE_PACKAGES.join(", ")}`);
}

if (import.meta.main) {
  const usage = {
    summary: "build @jgengine/core, react and shell as one program and write each package's dist/",
    usage: "bun scripts/build-engine.ts",
    flags: [],
    example: "bun --cwd=packages/core run build",
  };
  if (printHelpIfAsked("build-engine", usage)) process.exit(0);
  main();
}
