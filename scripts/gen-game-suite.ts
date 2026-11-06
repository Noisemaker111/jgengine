// `bun run gen` target `game-suite`: writes each game's suite score, from its committed
// `proofs/suite-report.json` scored against the live catalog, to the top of its README (one line under the
// title) and, for a game with a PLAN.md, as a `## Suite score` section ahead of the first section. Both
// sit between markers this script owns; nothing else in either file changes. The proofs themselves run in
// the game's `bun test` (`jgengine suite <game>`), never here.
//
//   bun scripts/gen-game-suite.ts           write
//   bun scripts/gen-game-suite.ts --check   exit 1 when a file is stale
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { renderSuiteAreaTable, renderSuiteMarkdown, suiteScoreLine, type GameSuiteScore } from "@jgengine/core/suite/gameSuite";

import { scoreCommittedSuite } from "../games/shared/suiteReport";

const root = join(import.meta.dir, "..");
const gamesDir = join(root, "games");
const START = "<!-- suite-score: written by `bun run gen` from proofs/suite-report.json -->";
const END = "<!-- /suite-score -->";

function block(lines: readonly string[]): string {
  return [START, ...lines, END].join("\n");
}

/** Replace the marked block, or insert it where `place` says; `place` gets the text without a block. */
function upsert(text: string, made: string, place: (text: string) => string): string {
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start >= 0 && end > start) return text.slice(0, start) + made + text.slice(end + END.length);
  return place(text);
}

function readmeBlock(game: string, score: GameSuiteScore): string {
  return block([`Game suite: **${suiteScoreLine(score)}** · \`jgengine suite ${game}\``]);
}

function planBlock(game: string, score: GameSuiteScore): string {
  return block([
    "## Suite score",
    "",
    `What players must be able to do, proven by headless simulation in \`bun test\` (\`jgengine suite ${game}\`). This is the headline; the engine coverage table below only hints where the engine has a part.`,
    "",
    ...renderSuiteAreaTable(score),
    "",
    "<details><summary>Every required entry</summary>",
    "",
    ...renderSuiteMarkdown(score),
    "",
    "</details>",
  ]);
}

/** Under the first line (the `# Title`), after one blank line. */
function underTitle(made: string): (text: string) => string {
  return (text) => {
    const eol = text.indexOf("\n");
    if (eol < 0) return `${text}\n\n${made}\n`;
    return `${text.slice(0, eol + 1)}\n${made}\n${text.slice(eol + 1)}`;
  };
}

/** Ahead of the first `## ` section; at the end when there is none. */
function beforeFirstSection(made: string): (text: string) => string {
  return (text) => {
    const at = text.search(/^## /m);
    if (at < 0) return `${text.trimEnd()}\n\n${made}\n`;
    return `${text.slice(0, at)}${made}\n\n${text.slice(at)}`;
  };
}

function main(argv: string[]): number {
  const check = argv.includes("--check");
  const stale: string[] = [];
  const games = readdirSync(gamesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(join(gamesDir, entry.name, "jgengine.json"))).map((entry) => entry.name).sort();
  for (const game of games) {
    const dir = join(gamesDir, game);
    const score = scoreCommittedSuite(dir);
    if (score === null) continue;
    const writes: [string, string, (text: string) => string][] = [[join(dir, "README.md"), readmeBlock(game, score), underTitle(readmeBlock(game, score))]];
    if (existsSync(join(dir, "PLAN.md"))) writes.push([join(dir, "PLAN.md"), planBlock(game, score), beforeFirstSection(planBlock(game, score))]);
    for (const [path, made, place] of writes) {
      if (!existsSync(path)) continue;
      const before = readFileSync(path, "utf8");
      const after = upsert(before, made, place);
      if (after === before) continue;
      if (check) stale.push(path.slice(root.length + 1).replaceAll("\\", "/"));
      else writeFileSync(path, after);
    }
  }
  if (stale.length > 0) {
    console.error(`game suite scores are stale (bun run gen game-suite): ${stale.join(", ")}`);
    return 1;
  }
  return 0;
}

process.exit(main(process.argv.slice(2)));
