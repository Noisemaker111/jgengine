import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
const root = resolve(new URL("..", import.meta.url).pathname);
const gamesRoot = join(root, "Games");
const games = existsSync(gamesRoot) ? readdirSync(gamesRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(gamesRoot, e.name)) : [];
const targets = games.length ? games : (existsSync(join(process.cwd(), "src", "game.config.ts")) ? [process.cwd()] : []);
let failed = 0;
for (const dir of targets) {
  const file = join(dir, "src", "art-direction.md");
  if (!existsSync(file)) { console.error(`check-art-direction: ${dir}: missing src/art-direction.md`); failed++; continue; }
  let section = "";
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.startsWith("## ")) section = line.slice(3).trim();
    if (line.trim() === "TODO: fill in") { console.error(`check-art-direction: ${dir}: ${section}: TODO: fill in`); failed++; }
  }
}
process.exit(failed ? 1 : 0);
