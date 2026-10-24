import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ignoredGames, referenceGames, requireGamesAtPin, warnIgnoredGames } from "./games-scope";
const root = fileURLToPath(new URL("..", import.meta.url));
const gamesRoot = join(root, "Games");
if (!existsSync(join(process.cwd(), "src", "game.config.ts"))) requireGamesAtPin("check-art-direction", root);
if (existsSync(gamesRoot)) warnIgnoredGames("check-art-direction", ignoredGames(root, referenceGames(root)));
const scope = referenceGames(root);
const games = existsSync(gamesRoot) ? readdirSync(gamesRoot, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".") && scope.includes(e.name) && (existsSync(join(gamesRoot, e.name, "src/index.tsx")) || existsSync(join(gamesRoot, e.name, "src/game.config.ts")))).map((e) => join(gamesRoot, e.name)) : [];
const targets = games.length ? games : (existsSync(join(process.cwd(), "src", "game.config.ts")) ? [process.cwd()] : []);
const gaps: string[] = [];
for (const dir of targets) {
  const label = games.length ? dir.slice(gamesRoot.length + 1) : dir;
  const file = join(dir, "src", "art-direction.md");
  if (!existsSync(file)) { gaps.push(`${label}: missing src/art-direction.md`); continue; }
  let section = "";
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.startsWith("## ")) section = line.slice(3).trim();
    if (line.trim() === "TODO: fill in") gaps.push(`${label}: ${section}: TODO: fill in`);
  }
}
// Games/ is the separately versioned probe-games repo; its known gaps are a shrink-only baseline so its pushes cannot redden this repo.
const baselinePath = join(root, "scripts", "art-direction-baseline.json");
if (games.length && process.argv.includes("--write")) {
  writeFileSync(baselinePath, `${JSON.stringify(gaps.sort(), null, 2)}\n`);
  process.exit(0);
}
const baseline = new Set<string>(games.length && existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : []);
const added = gaps.filter((gap) => !baseline.has(gap));
const stale = [...baseline].filter((gap) => !gaps.includes(gap));
for (const gap of added) console.error(`check-art-direction: ${gap}`);
if (stale.length) console.error(`check-art-direction: baseline entries no longer apply — run bun run check-art-direction --write\n  ${stale.join("\n  ")}`);
process.exit(added.length || stale.length ? 1 : 0);
