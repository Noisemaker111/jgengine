import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SKELETON_FILES = new Set(["game.config.ts", "index.tsx", "main.tsx", "loop.ts", "world.ts", "index.css"]);
const SKELETON_DIRS = new Set(["game"]);

const REQUIRED_TSCONFIG_PATHS: Record<string, string> = {
  "@jgengine/core/*": "../../packages/core/src/*",
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

  const configPath = join(srcDir, "game.config.ts");
  if (!existsSync(configPath)) {
    problems.push(`${rel(srcDir)}: missing canonical entry game.config.ts`);
  } else if (!/from\s+["']@jgengine\/shell\/(defineGame|cartridge)["']/.test(readFileSync(configPath, "utf8"))) {
    problems.push(
      `${rel(configPath)}: must define the game via defineGame from "@jgengine/shell/defineGame" or cartridge from "@jgengine/shell/cartridge"`,
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
    if (isDir ? !SKELETON_DIRS.has(entry) : !SKELETON_FILES.has(entry)) {
      problems.push(`${rel(full)}: game-specific ${isDir ? "directory" : "file"} must live under src/game/`);
    }
  }
}

if (problems.length > 0) {
  console.error(
    `\ncheck-game-shape: ${problems.length} issue(s) off the canonical shape:\n` +
      problems.map((p) => `  ${p}`).join("\n") +
      `\n\nEvery game is one shape: src/ holds only the skeleton\n` +
      `  game.config.ts  index.tsx  main.tsx  loop.ts  world.ts  index.css\n` +
      `and all game-specific modules, ui, and tests live under src/game/.\n` +
      `game.config.ts is the single entry — defineGame({...}) from "@jgengine/shell/defineGame",\n` +
      `or cartridge({...}) from "@jgengine/shell/cartridge" for declarative cartridge games\n` +
      `(which drop loop.ts/world.ts entirely — the spec carries the whole game).\n` +
      `Every game is also a standalone dev harness: index.html and vite.config.ts at the game root,\n` +
      `src/index.css for Tailwind, and a "dev" script in package.json to launch it.\n` +
      `The root package.json exposes each harness as "games:<id>": "bun run --cwd Games/<id> dev".\n`,
  );
  process.exit(1);
}

console.log("check-game-shape: clean — all games follow the canonical game.config.ts skeleton");
