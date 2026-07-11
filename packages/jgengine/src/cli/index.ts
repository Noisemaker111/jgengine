#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { runCreate } from "../create";
import { runDoctor } from "../doctor";
import { cliVersion, findUp, readPackageJson } from "../pkg";

const ENGINE_PACKAGES = ["core", "react", "shell", "ws", "sql", "convex", "node", "assets"];

const HELP = `jgengine ${cliVersion()} — the JGengine command line
Pure-TypeScript, genre-agnostic game engine SDK. Packages: ${ENGINE_PACKAGES.map((name) => `@jgengine/${name}`).join(", ")}.

usage: jgengine <command> [...args]

  create "<Game Name>"  scaffold a playable base — flat world, spawned player, HUD, verify test.
                        folder becomes My-Game-Name; name lands in game.config / HUD / title.
                        [--in-repo|--standalone] [--no-install] [--pm bun|npm|pnpm]
  doctor [dir]          diagnose a game project: version skew, missing peers, unstyled-UI @source gaps, shape drift
  skills                install the JGengine agent skills (API reference, game-build workflow, verify gate) into .claude/skills
  llms [package]        print packaged API docs (llms.txt) for an installed @jgengine/* package — agent-ready context
  assets [...]          delegate to the @jgengine/assets CLI: list, search, pull CC0 3D model packs
  versions              show CLI + installed @jgengine/* versions
  help                  this map

docs: https://jgengine.com · source: https://github.com/Noisemaker111/jgengine
new here (human or agent)? run: npx jgengine create "My Game Name" && cd My-Game-Name && npx jgengine skills
`;

function runVersions(): number {
  console.log(`jgengine ${cliVersion()}`);
  const projectDir = findUp(process.cwd(), (dir) => existsSync(join(dir, "package.json")));
  if (projectDir === null) return 0;
  const pkg = readPackageJson(join(projectDir, "package.json"));
  const declared = Object.entries({ ...pkg?.dependencies, ...pkg?.devDependencies }).filter(([name]) =>
    name.startsWith("@jgengine/"),
  );
  for (const [name, range] of declared) {
    const installed = readPackageJson(join(projectDir, "node_modules", name, "package.json"))?.version;
    console.log(`  ${name}  declared ${range}  installed ${installed ?? "(not installed — run install)"}`);
  }
  if (declared.length === 0) console.log("  no @jgengine/* dependencies in the nearest package.json");
  return 0;
}

function runLlms(argv: string[]): number {
  const target = argv.find((arg) => !arg.startsWith("--")) ?? "core";
  if (target === "jgengine") {
    const own = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "llms.txt");
    if (existsSync(own)) {
      process.stdout.write(readFileSync(own, "utf8"));
      return 0;
    }
    console.error("error: llms.txt not packaged in this build");
    return 1;
  }
  const packageName = target.startsWith("@jgengine/") ? target : `@jgengine/${target}`;
  const found = findUp(process.cwd(), (dir) => existsSync(join(dir, "node_modules", packageName, "llms.txt")));
  if (found === null) {
    console.error(`error: ${packageName}/llms.txt not found in any node_modules above ${process.cwd()}`);
    console.error(`install the package first (bun add ${packageName}) — its llms.txt ships in the npm tarball`);
    return 1;
  }
  process.stdout.write(readFileSync(join(found, "node_modules", packageName, "llms.txt"), "utf8"));
  return 0;
}

function runSkills(): number {
  console.log("installing JGengine agent skills (jgengine-api, jgengine-newgame, jgengine-verify)…");
  const result = spawnSync("npx", ["--yes", "skills", "add", "Noisemaker111/jgengine"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status ?? 1;
}

function runAssets(argv: string[]): number {
  const require = createRequire(import.meta.url);
  let cliPath: string;
  try {
    cliPath = require.resolve("@jgengine/assets/cli/pull");
  } catch {
    console.error("error: @jgengine/assets is not resolvable from the jgengine CLI installation");
    return 1;
  }
  const result = spawnSync(process.execPath, [cliPath, ...argv], { stdio: "inherit" });
  return result.status ?? 1;
}

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "create":
    process.exit(runCreate(rest));
    break;
  case "doctor":
    process.exit(runDoctor(rest));
    break;
  case "skills":
    process.exit(runSkills());
    break;
  case "llms":
    process.exit(runLlms(rest));
    break;
  case "assets":
    process.exit(runAssets(rest));
    break;
  case "versions":
    process.exit(runVersions());
    break;
  case "--version":
  case "-v":
    console.log(cliVersion());
    break;
  case undefined:
  case "help":
  case "--help":
  case "-h":
    console.log(HELP);
    break;
  default:
    console.error(`unknown command: ${command}\n`);
    console.log(HELP);
    process.exit(1);
}
