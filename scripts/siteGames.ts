import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export function siteGames(gamesDir = join(repoRoot, "games")): string[] {
  return readdirSync(gamesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "llmville" && existsSync(join(gamesDir, entry.name, "src", "index.tsx")))
    .map((entry) => entry.name)
    .sort();
}
