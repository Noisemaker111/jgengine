#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { runCreate } from "../create";
import { runDesktop } from "../desktop";
import { runDoctor } from "../doctor";
import { cliVersion, findUp, readPackageJson } from "../pkg";
import { runSkills } from "../skills";
import { editorScaffold } from "../templates";

const ENGINE_PACKAGES = ["core", "react", "shell", "ws", "sql", "convex", "node", "assets", "editor"];

const HELP = `jgengine ${cliVersion()} — agent-side CLI for the JGengine TypeScript game SDK
Packages: ${ENGINE_PACKAGES.map((name) => `@jgengine/${name}`).join(", ")}.
docs: https://jgengine.com · source: https://github.com/Noisemaker111/jgengine

HUMAN INTERFACE (what people say to you — not a shell they must run):
  Make a game that ... with jgengine

AGENT RESPONSE (you run these; do not dump this as homework for the user):
  npx jgengine create "Game Name"   # scaffold + install skills into the project
  cd Game-Name
  # intake → foundation + only needed domains → build (see jgengine skill)

The game is its own project on the npm packages. NEVER clone the jgengine
GitHub repo to build a game, and NEVER copy code/assets/content from its
Games/* directory — those are private in-repo test games, not templates.

usage: jgengine <command> [...args]

  create "<Game Name>"  scaffold playable base + install agent skills into the project
                        folder My-Game-Name; name → game.config / HUD / title
                        [--in-repo|--standalone] [--no-install] [--no-skills] [--pm bun|npm|pnpm]
  desktop [dir]         ship a Windows NSIS installer (local project or --url https://…)
                        [--url] [--name] [--id] [--version] [--icon] [--out] [--dry-run]
  editor [dir]          open the standalone 3D scene editor on a folder (default cwd) —
                        loads its editor.scene.json + models, Ctrl+S writes back
                        [--assets <dir>] [--port <n>] [--out <workspace-dir>]
  skills -p | -g        re-install skills (recovery only — create already installs them)
  doctor [dir]          diagnose version skew, missing peers, unstyled HUD, shape drift
  assets [...]          @jgengine/assets CLI: list, search, pull CC0 packs
  editor-mcp [...]      scene editor agent bridge (document RPC / localhost server)
  versions              CLI + installed @jgengine/* versions
  help                  this map
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

function runEditor(argv: string[]): number {
  const positional: string[] = [];
  let assetsDir: string | undefined;
  let port: string | undefined;
  let outDir: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--assets") assetsDir = argv[(i += 1)];
    else if (arg === "--port") port = argv[(i += 1)];
    else if (arg === "--out") outDir = argv[(i += 1)];
    else if (!arg.startsWith("-")) positional.push(arg);
  }

  const targetDir = resolve(positional[0] ?? ".");
  if (!existsSync(targetDir)) {
    console.error(`error: folder not found: ${targetDir}`);
    return 1;
  }
  const workspace = resolve(outDir ?? join(targetDir, ".jgengine-editor"));

  for (const file of editorScaffold(cliVersion())) {
    const dest = join(workspace, file.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, file.contents);
  }

  if (!existsSync(join(workspace, "node_modules"))) {
    console.error("jgengine editor: installing the editor workspace (first run only)…");
    const install = spawnSync("bun", ["install"], { cwd: workspace, stdio: "inherit" });
    if ((install.status ?? 1) !== 0) {
      console.error("error: workspace install failed — is `bun` on PATH?");
      return install.status ?? 1;
    }
  }

  console.error(`jgengine editor: authoring ${targetDir} — Ctrl+S saves editor.scene.json`);
  const env = {
    ...process.env,
    JG_EDITOR_DIR: targetDir,
    ...(assetsDir === undefined ? {} : { JG_EDITOR_ASSETS: resolve(assetsDir) }),
  };
  const devArgs = ["run", "dev", ...(port === undefined ? [] : ["--", "--port", port])];
  const result = spawnSync("bun", devArgs, { cwd: workspace, stdio: "inherit", env });
  return result.status ?? 1;
}

function runEditorMcp(argv: string[]): number {
  const here = dirname(fileURLToPath(import.meta.url));
  const monorepoCli = join(here, "..", "..", "..", "editor", "src", "mcp", "cli.ts");
  if (existsSync(monorepoCli)) {
    const result = spawnSync("bun", [monorepoCli, ...argv], { stdio: "inherit" });
    return result.status ?? 1;
  }
  console.error("error: editor-mcp CLI not found — run from the jgengine monorepo or install @jgengine/editor");
  return 1;
}

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "create":
    process.exit(runCreate(rest));
    break;
  case "desktop":
    runDesktop(rest);
    break;
  case "doctor":
    process.exit(runDoctor(rest));
    break;
  case "skills":
    process.exit(runSkills(rest));
    break;
  case "assets":
    process.exit(runAssets(rest));
    break;
  case "editor":
    process.exit(runEditor(rest));
    break;
  case "editor-mcp":
    process.exit(runEditorMcp(rest));
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
