// Builds @jgengine/core: every layer (model, view, draw) in one compile into one dist/, then the files
// the compiler does not emit (wasm loaded by URL, the engine stylesheet).
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { printHelpIfAsked } from "./script-help";

/** Files the source loads at runtime by URL (`new URL("./x.wasm", import.meta.url)`), which tsgo does not emit. */
const RUNTIME_ASSET = /\.wasm$/;

/** Copy every runtime asset under `src` to the same place under `dist`. */
export function copyAssets(src: string, dist: string): string[] {
  const copied: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const from = join(dir, entry.name);
      if (entry.isDirectory()) walk(from);
      else if (RUNTIME_ASSET.test(entry.name)) {
        const to = join(dist, relative(src, from));
        mkdirSync(dirname(to), { recursive: true });
        copyFileSync(from, to);
        copied.push(relative(src, from));
      }
    }
  };
  walk(src);
  return copied;
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
  const core = join(root, "packages", "core");
  const dist = join(core, "dist");
  const out = join(root, ".scratch", "core-build");
  rmSync(out, { recursive: true, force: true });
  rmSync(dist, { recursive: true, force: true });
  // core and ws import each other (the multiplayer draw files run ws hosts; ws reads core models), so
  // neither can build first from the other's dist: this one compile reads ws source and keeps core's half.
  const config = join(root, ".scratch", "core-build.tsconfig.json");
  mkdirSync(dirname(config), { recursive: true });
  writeFileSync(config, `${JSON.stringify({
    extends: relative(dirname(config), join(core, "tsconfig.build.json")).replace(/\\/g, "/"),
    compilerOptions: { paths: {
      "@jgengine/core": [relative(dirname(config), join(core, "src", "index.ts")).replace(/\\/g, "/")],
      "@jgengine/core/*": [`${relative(dirname(config), join(core, "src")).replace(/\\/g, "/")}/*`],
      "@jgengine/ws/*": [`${relative(dirname(config), join(root, "packages", "ws", "src")).replace(/\\/g, "/")}/*`],
    } },
  }, null, 2)}\n`);
  run(["bun", "x", "tsgo", "-p", config], root);
  rmSync(config, { force: true });
  const emitted = join(out, "core", "src");
  if (!existsSync(emitted)) {
    console.error("build-engine: nothing emitted for core");
    process.exit(1);
  }
  renameSync(emitted, dist);
  rmSync(out, { recursive: true, force: true });
  run(["bun", join(root, "scripts", "fix-extensions.ts"), dist], root);
  copyAssets(join(core, "src"), dist);
  run(["bun", join(core, "scripts", "styles.ts")], root);
  console.log("build-engine: built @jgengine/core");
}

if (import.meta.main) {
  const usage = {
    summary: "build @jgengine/core (model, view and draw files) into packages/core/dist",
    usage: "bun scripts/build-engine.ts",
    flags: [],
    example: "bun --cwd=packages/core run build",
  };
  if (printHelpIfAsked("build-engine", usage)) process.exit(0);
  main();
}
