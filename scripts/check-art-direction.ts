import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
const root = resolve(new URL("..", import.meta.url).pathname);
const gamesRoot = join(root, "Games");
if (!existsSync(gamesRoot) && process.env.CI === "true") {
  console.error("check-art-direction: Games/ checkout is required in CI — run bun run games:clone first");
  process.exit(1);
}
const games = existsSync(gamesRoot) ? readdirSync(gamesRoot, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => join(gamesRoot, e.name)) : [];
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
