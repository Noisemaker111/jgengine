/**
 * Seed each game's `capabilities.json` from its source with `games:capabilities-declare`.
 *
 * The generated file is the starting point, not a verdict: adoption comes from
 * a real import of the capability's module (or a barrel-exported API name), and
 * every decline is seeded as a TODO that fails the gate. A game owner replaces
 * each one with `not-applicable` (the domain is absent) or `debt` (the game has
 * the domain and has not adopted the shared system) plus the open issue that
 * tracks adopting it; the gate then enforces that the file stays complete.
 *
 * Usage: bun run games:capabilities-declare [game...] [--force]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  declarationPath,
  deriveLedger,
  gameDirs,
  readDeclaration,
  renderDeclaration,
  seedDeclaration,
} from "./capabilities";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const force = args.includes("--force");
const wanted = args.filter((arg) => !arg.startsWith("--"));
const games = gameDirs(root).filter((game) => wanted.length === 0 || wanted.includes(game));
const ledger = deriveLedger(root);

if (games.length === 0) {
  console.error(`games:capabilities-declare FAIL - no games matched ${wanted.join(", ") || "(all)"}`);
  process.exit(1);
}

let failures = 0;
for (const game of games) {
  const path = declarationPath(root, game);
  if (existsSync(path) && !force) {
    console.log(`games:capabilities-declare SKIP ${game} - ${path} already exists (use --force to reseed)`);
    continue;
  }
  const declaration = seedDeclaration(root, game, ledger);
  writeFileSync(path, renderDeclaration(declaration));
  const adopted = declaration.adopts.length;
  const declined = Object.keys(declaration.declines).length;
  const probes = Object.keys(declaration.probes ?? {}).length;
  console.log(`games:capabilities-declare OK ${game} - ${adopted} adopted, ${declined} declined, ${probes} probed`);
  console.log(
    `  Review ${path}: a declared probe must report at boot. Every decline is a TODO until you say "not-applicable" (this game has no such domain) or "debt" (it has the domain and has not adopted the shared system, with the open issue that tracks it).`,
  );
}

if (failures > 0) process.exit(1);

// Keep a failed reseed visible rather than silently leaving an old file.
for (const game of games) {
  const path = declarationPath(root, game);
  if (!existsSync(path)) {
    console.error(`games:capabilities-declare FAIL - ${game} has no ${path} after seeding`);
    failures += 1;
    continue;
  }
  try {
    JSON.parse(readFileSync(path, "utf8"));
  } catch {
    console.error(`games:capabilities-declare FAIL - ${path} is not valid JSON`);
    failures += 1;
  }
}
if (failures > 0) process.exit(1);
