// `jgengine suite <game>`: a game's suite score. Runs the game's suite test (every headless proof in
// `proofs/sim/` and the content check, in `bun test`), which writes `proofs/suite-report.json`, then
// scores that report against the live catalog: proven of required, by area, with failing entries, cuts
// and their reasons, and what is missing.
//
//   bun scripts/game-suite.ts fernwild             run the proofs, print the score
//   bun scripts/game-suite.ts fernwild --no-run    score the committed report only
//   bun scripts/game-suite.ts all --no-run         every game that declares a suite
//   bun scripts/game-suite.ts --genres creature-survival   the entries those genres require, with depth,
//                                                  to plan a proof per entry before the game exists
//   --markdown                                     the per-area table and the full entry table
//
// Exit: 0 when nothing is failing, 1 when an entry fails, a declaration is wrong, or the suite test failed.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { expandSuiteGenres, renderSuiteAreaTable, renderSuiteMarkdown, renderSuiteText, requiredSuiteEntries, suiteArea } from "@jgengine/core/suite/gameSuite";
import { SUITE_GENRES } from "@jgengine/core/suite/suiteCatalog";

import { scoreCommittedSuite } from "../games/shared/suiteReport";

const root = join(import.meta.dir, "..");
const gamesDir = join(root, "games");
const SUITE_TEST = "src/suite.test.ts";

function suiteGames(): string[] {
  return readdirSync(gamesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(gamesDir, entry.name, "jgengine.json")))
    .map((entry) => entry.name)
    .filter((name) => scoreCommittedSuite(join(gamesDir, name)) !== null)
    .sort();
}

/** Run a game's suite test; its own output is shown only when it fails. */
function runSuiteTest(game: string): boolean {
  const dir = join(gamesDir, game);
  if (!existsSync(join(dir, SUITE_TEST))) {
    console.log(`${game}: no ${SUITE_TEST} yet, so nothing is proven; scoring the declared suite`);
    return true;
  }
  console.log(`${game}: running the suite test (headless proofs and the content check)...`);
  const run = Bun.spawnSync(["bun", "test", "--preload", "../../scripts/three-preload.ts", SUITE_TEST], { cwd: dir, stdout: "pipe", stderr: "pipe" });
  if (run.exitCode === 0) return true;
  process.stdout.write(run.stdout.toString());
  process.stderr.write(run.stderr.toString());
  console.error(`${game}: the suite test failed (a proven entry regressed, or a declaration is wrong)`);
  return false;
}

/** The entries a set of genres requires, grouped by area, each with its proof and depth. */
function printRequired(genres: readonly string[]): number {
  const unknown = genres.filter((genre) => !SUITE_GENRES.some((known) => known.id === genre));
  if (unknown.length > 0) {
    console.error(`suite: unknown genre ${unknown.join(", ")}; the genres are ${SUITE_GENRES.map((genre) => genre.id).join(", ")}`);
    return 1;
  }
  const entries = requiredSuiteEntries(genres);
  console.log(`${genres.join(", ")} (with ${expandSuiteGenres(genres).join(", ")}): ${entries.length} required entries. Plan a proof for each.`);
  let area = "";
  for (const entry of entries) {
    if (suiteArea(entry.id) !== area) {
      area = suiteArea(entry.id);
      console.log(`\n${area}`);
    }
    console.log(`  ${entry.id} [${entry.by}] ${entry.does}`);
    console.log(`      proof: ${entry.proof}`);
    const depth = entry.depth;
    if (depth === undefined) continue;
    console.log(`      find: ${depth.find}`);
    console.log(`      improves: ${depth.improves}`);
    console.log(`      feeds: ${depth.feeds.join(", ")}`);
    console.log(`      hour 5: ${depth.repeat}`);
    console.log(`      fails: ${depth.fails}`);
  }
  return 0;
}

function main(argv: string[]): number {
  const genresAt = argv.indexOf("--genres");
  if (genresAt >= 0) return printRequired((argv[genresAt + 1] ?? "").split(",").filter((genre) => genre !== ""));
  const flags = new Set(argv.filter((arg) => arg.startsWith("-")));
  const names = argv.filter((arg) => !arg.startsWith("-"));
  if (names.length === 0 || flags.has("--help") || flags.has("-h")) {
    console.log("usage: jgengine suite <game...|all> [--no-run] [--markdown] | jgengine suite --genres <genre,...>");
    return names.length === 0 && !flags.has("--help") && !flags.has("-h") ? 2 : 0;
  }
  const games = names.includes("all") ? suiteGames() : names;
  let ok = true;
  for (const game of games) {
    const dir = join(gamesDir, game);
    if (!existsSync(join(dir, "jgengine.json"))) {
      console.error(`suite: no game at games/${game}`);
      ok = false;
      continue;
    }
    if (!flags.has("--no-run") && !runSuiteTest(game)) ok = false;
    const score = scoreCommittedSuite(dir);
    if (score === null) {
      console.error(`${game}: jgengine.json declares no "suite": add { "suite": { "genres": [...] } } and read the required entries`);
      ok = false;
      continue;
    }
    if (flags.has("--markdown")) console.log([`### ${game}`, "", ...renderSuiteAreaTable(score), "", ...renderSuiteMarkdown(score), ""].join("\n"));
    else console.log(`${renderSuiteText(score).join("\n")}\n`);
    if (score.counts.failing > 0 || score.problems.length > 0) ok = false;
  }
  return ok ? 0 : 1;
}

process.exit(main(process.argv.slice(2)));
