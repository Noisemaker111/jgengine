import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  countCreates,
  countImporters,
  coreFolders,
  homeOf,
  PATTERN_NAMES,
  privateCopies,
  renderTable,
  renderWorklist,
  type Source,
} from "./part-stats";

const FIXTURE = fileURLToPath(new URL("./fixtures/part-stats/", import.meta.url));

/** Each fixture file's text, under the repository path it stands for. */
const FILES: Record<string, string> = {
  "packages/core/src/combat/roller.ts": "combat-roller.txt",
  "packages/core/src/ai/brain.ts": "ai-brain.txt",
  "packages/core/src/ai/loose.ts": "ai-loose.txt",
  "packages/core/src/devtools/tiers.ts": "devtools-tiers.txt",
  "packages/core/src/loot/table.ts": "loot-table.txt",
  "packages/core/src/ui/bar.ts": "ui-bar.txt",
  "packages/core/src/math/scalar.ts": "math-scalar.txt",
  "packages/core/src/random/pick.ts": "random-pick.txt",
  "packages/core/src/random/pick.test.ts": "random-pick-test.txt",
  "games/demo/src/game/tick.ts": "games-tick.txt",
  "games/demo/src/game/cool.ts": "games-cool.txt",
};

function fixture(): Source[] {
  return Object.entries(FILES).map(([path, file]) => ({ path, text: readFileSync(join(FIXTURE, file), "utf8") }));
}

function countOf(rows: ReturnType<typeof countImporters>, home: string) {
  return rows.find((row) => row.home === home);
}

describe("importers are counted per part home, core and games apart", () => {
  const rows = countImporters(fixture());

  test("a relative import from core and a package import from a game both count", () => {
    expect(countOf(rows, "random/pick")).toEqual({ home: "random/pick", core: 2, games: 1 });
    expect(countOf(rows, "stats/statPool")).toEqual({ home: "stats/statPool", core: 0, games: 1 });
  });

  test("a part's own file and a test file do not count", () => {
    expect(countOf(rows, "random/pick")?.core).toBe(2);
  });

  test("an import of a home nobody uses counts zero", () => {
    expect(countOf(rows, "threshold/thresholds")).toEqual({ home: "threshold/thresholds", core: 0, games: 0 });
  });

  test("a specifier outside the core tree reaches no home", () => {
    expect(homeOf("react", "games/demo/src/game/tick.ts")).toBeNull();
    expect(homeOf("../time/cooldown", "packages/core/src/ai/brain.ts")).toBe("time/cooldown");
    expect(homeOf("@jgengine/core/time/cooldown", "games/demo/src/x.ts")).toBe("time/cooldown");
  });
});

describe("the create and folder counts read core source only", () => {
  const sources = fixture();

  test("`export function create` counts in core, not in games or tests", () => {
    expect(countCreates(sources)).toBe(4);
  });

  test("core's top-level folders are counted once each", () => {
    expect(coreFolders(sources)).toEqual(["ai", "combat", "devtools", "loot", "math", "random", "ui"]);
  });

  test("the table prints the importer rows and both totals", () => {
    const table = renderTable(countImporters(sources), countCreates(sources), coreFolders(sources).length);
    expect(table).toContain("random/pick");
    expect(table).toContain("export function create* in core: 4");
    expect(table).toContain("core top-level folders: 7");
  });
});

describe("the worklist names each private copy with file:line, by pattern", () => {
  const copies = privateCopies(fixture());
  const at = (pattern: string) => copies.filter((copy) => copy.pattern === pattern).map((copy) => `${copy.file}:${copy.line}`);

  test("an ordered threshold list with its at-number and a name", () => {
    expect(at(PATTERN_NAMES[0])).toEqual(["packages/core/src/devtools/tiers.ts:2"]);
  });

  test("a weight subtraction, in core and in a game, but not in the pick home", () => {
    expect(at(PATTERN_NAMES[1])).toEqual([
      "packages/core/src/loot/table.ts:5",
      "games/demo/src/game/tick.ts:6",
    ]);
  });

  test("a countdown of dt, unless it imports the cooldown or refill home", () => {
    expect(at(PATTERN_NAMES[2])).toEqual(["packages/core/src/ai/loose.ts:2", "games/demo/src/game/cool.ts:2"]);
  });

  test("a local clamp, but not the math home that owns it", () => {
    expect(at(PATTERN_NAMES[3])).toEqual(["packages/core/src/ui/bar.ts:1"]);
  });

  test("the report prints every pattern heading, with its count", () => {
    const report = renderWorklist(copies);
    for (const name of PATTERN_NAMES) expect(report).toContain(`${name}: `);
    expect(report).toContain("  packages/core/src/ui/bar.ts:1  export function clamp");
  });
});
