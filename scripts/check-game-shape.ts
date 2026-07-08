import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SKELETON_FILES = new Set(["game.config.ts", "index.tsx", "main.tsx", "loop.ts", "world.ts"]);
const SKELETON_DIRS = new Set(["game"]);

const gamesDir = join(process.cwd(), "Games");

function rel(path: string): string {
  return path.replace(process.cwd() + "\\", "").replace(process.cwd() + "/", "").replaceAll("\\", "/");
}

const problems: string[] = [];

for (const name of readdirSync(gamesDir)) {
  const gameDir = join(gamesDir, name);
  if (!statSync(gameDir).isDirectory()) continue;
  if (!existsSync(join(gameDir, "package.json"))) continue;

  const srcDir = join(gameDir, "src");
  if (!existsSync(srcDir)) {
    problems.push(`${rel(gameDir)}: missing src/`);
    continue;
  }

  const configPath = join(srcDir, "game.config.ts");
  if (!existsSync(configPath)) {
    problems.push(`${rel(srcDir)}: missing canonical entry game.config.ts`);
  } else if (!/from\s+["']@jgengine\/shell\/defineGame["']/.test(readFileSync(configPath, "utf8"))) {
    problems.push(`${rel(configPath)}: must define the game via defineGame from "@jgengine/shell/defineGame"`);
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
      `  game.config.ts  index.tsx  main.tsx  loop.ts  world.ts\n` +
      `and all game-specific modules, ui, and tests live under src/game/.\n` +
      `game.config.ts is the single entry — defineGame({...}) from "@jgengine/shell/defineGame".\n`,
  );
  process.exit(1);
}

console.log("check-game-shape: clean — all games follow the canonical game.config.ts skeleton");
