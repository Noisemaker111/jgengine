import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  gameSkeletonRequiredSummary,
  isAllowedGameSrcEntry,
} from "../packages/jgengine/src/gameShape";

const REQUIRED_TSCONFIG_PATHS: Record<string, string> = {
  "@jgengine/core/*": "../../packages/core/src/*",
  "@jgengine/react": "../../packages/react/src/index.ts",
  "@jgengine/react/*": "../../packages/react/src/*",
  "@jgengine/ws/*": "../../packages/ws/src/*",
  "@jgengine/shell/*": "../../packages/shell/src/*",
  "@jgengine/assets": "../../packages/assets/src/index.ts",
  "@jgengine/assets/*": "../../packages/assets/src/*",
};

const gamesDir = join(process.cwd(), "Games");

const rootScripts =
  (JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { scripts?: Record<string, string> })
    .scripts ?? {};

function rel(path: string): string {
  return path.replace(process.cwd() + "\\", "").replace(process.cwd() + "/", "").replaceAll("\\", "/");
}

const problems: string[] = [];

function sourceFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFilesUnder(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** An import of the shell's AuthoredScene component, from any path. */
function importsAuthoredScene(source: string): boolean {
  return /import\s[^;]*\bAuthoredScene\b[^;]*\sfrom\s/.test(source);
}

for (const name of readdirSync(gamesDir)) {
  const gameDir = join(gamesDir, name);
  if (!statSync(gameDir).isDirectory()) continue;
  const packageJsonPath = join(gameDir, "package.json");
  if (!existsSync(packageJsonPath)) continue;

  if (!existsSync(join(gameDir, "index.html"))) {
    problems.push(`${rel(gameDir)}: missing index.html for the standalone dev harness`);
  }
  if (!existsSync(join(gameDir, "vite.config.ts"))) {
    problems.push(`${rel(gameDir)}: missing vite.config.ts for the standalone dev harness`);
  }
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { scripts?: Record<string, string> };
  if (packageJson.scripts?.dev === undefined) {
    problems.push(`${rel(packageJsonPath)}: missing a "dev" script to launch the standalone harness`);
  }

  const rootGameScript = `bun run --cwd Games/${name} dev`;
  if (rootScripts[`games:${name}`] !== rootGameScript) {
    problems.push(`package.json: missing root script "games:${name}": "${rootGameScript}"`);
  }

  const tsconfigPath = join(gameDir, "tsconfig.json");
  if (!existsSync(tsconfigPath)) {
    problems.push(`${rel(tsconfigPath)}: missing tsconfig.json`);
  } else {
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8")) as {
      compilerOptions?: { paths?: Record<string, string[]> };
    };
    const paths = tsconfig.compilerOptions?.paths ?? {};
    for (const [alias, target] of Object.entries(REQUIRED_TSCONFIG_PATHS)) {
      const mapped = paths[alias];
      if (mapped === undefined || mapped[0] !== target) {
        problems.push(`${rel(tsconfigPath)}: compilerOptions.paths["${alias}"] must map to ["${target}"]`);
      }
    }
  }

  const srcDir = join(gameDir, "src");
  if (!existsSync(srcDir)) {
    problems.push(`${rel(gameDir)}: missing src/`);
    continue;
  }

  if (!existsSync(join(srcDir, "index.css"))) {
    problems.push(`${rel(srcDir)}: missing index.css for the standalone dev harness`);
  }
  if (!existsSync(join(srcDir, "style.css"))) {
    problems.push(`${rel(srcDir)}: missing style.css — game-specific CSS, imported by index.css, lazy-loaded standalone from the /play runner`);
  }

  const configPath = join(srcDir, "game.config.ts");
  if (!existsSync(configPath)) {
    problems.push(`${rel(srcDir)}: missing canonical entry game.config.ts`);
  } else if (!/from\s+["']@jgengine\/shell\/(defineGame|gameKit)["']/.test(readFileSync(configPath, "utf8"))) {
    problems.push(
      `${rel(configPath)}: must define the game via defineGame from "@jgengine/shell/gameKit" (or "@jgengine/shell/defineGame")`,
    );
  }

  const indexPath = join(srcDir, "index.tsx");
  if (!existsSync(indexPath)) {
    problems.push(`${rel(srcDir)}: missing index.tsx barrel`);
  } else if (!/\bgame\b/.test(readFileSync(indexPath, "utf8").match(/export\s*\{[^}]*\}/g)?.join(" ") ?? "")) {
    problems.push(`${rel(indexPath)}: must re-export { game } from "./game.config"`);
  }

  for (const entry of readdirSync(srcDir)) {
    const full = join(srcDir, entry);
    const isDir = statSync(full).isDirectory();
    if (!isAllowedGameSrcEntry(entry, isDir)) {
      problems.push(`${rel(full)}: game-specific ${isDir ? "directory" : "file"} must live under src/game/`);
    }
  }

  for (const file of sourceFilesUnder(srcDir)) {
    if (importsAuthoredScene(readFileSync(file, "utf8"))) {
      problems.push(
        `${rel(file)}: imports AuthoredScene — base scene ownership belongs to defineGame({ editorLayers }); WorldOverlay is VFX-only`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error(
    `\ncheck-game-shape: ${problems.length} issue(s) off the canonical shape:\n` +
      problems.map((p) => `  ${p}`).join("\n") +
      `\n\nEvery game is one shape: src/ holds only the skeleton\n` +
      `  ${gameSkeletonRequiredSummary().replaceAll(", ", "  ")}\n` +
      `and all game-specific modules, ui, and tests live under src/game/.\n` +
      `Optional top-level extras: loop.ts, world.ts, preview.tsx, scene-ownership.json, editor.scene.json,\n` +
      `and any editor-import-graph module matching editor<Name>.ts (editorLayers, editorCatalogs, editorKinds, …) plus its .test.ts.\n` +
      `game.config.ts is the single entry — defineGame({...}) from "@jgengine/shell/gameKit".\n` +
      `The base scene mounts via defineGame({ editorLayers }) — games never import AuthoredScene directly.\n` +
      `Every game is also a standalone dev harness: index.html and vite.config.ts at the game root,\n` +
      `src/index.css for Tailwind (importing "./style.css") and a "dev" script in package.json to launch it.\n` +
      `src/style.css holds the game-specific CSS only — no "@import \\"tailwindcss\\"" — so the /play\n` +
      `runner's per-game lazy CSS chunk stays small instead of re-shipping the shared Tailwind base.\n` +
      `The root package.json exposes each harness as "games:<id>": "bun run --cwd Games/<id> dev".\n`,
  );
  process.exit(1);
}

console.log("check-game-shape: clean — all games follow the canonical game.config.ts skeleton");
