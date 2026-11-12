import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DECISIONS, NATIVE_BENCH } from "./story";

const nativeReadme = readFileSync(join(import.meta.dir, "../../../../native/README.md"), "utf8");

/** fps and frame p50 of every results-table row for one game: `| Game | Row | Run | fps | p50 | ...`. */
function measured(game: string): { fps: number[]; p50: number[] } {
  const rows = nativeReadme
    .split("\n")
    .filter((line) => line.startsWith(`| ${game} |`))
    .map((line) => line.split("|").map((cell) => cell.trim()));
  return { fps: rows.map((cells) => Number(cells[4])), p50: rows.map((cells) => Number(cells[5])) };
}

test("the homepage benchmark quotes native/README.md's results table", () => {
  for (const game of NATIVE_BENCH) {
    const table = measured(game.game);
    expect(table.fps.length).toBeGreaterThan(0);
    for (const row of game.rows) {
      for (const fps of row.fps) expect(table.fps).toContain(fps);
      for (const p50 of row.p50) expect(table.p50).toContain(p50);
    }
  }
});

test("decisions run oldest first, each with a unique anchor and a link to check it", () => {
  const dates = DECISIONS.map((decision) => decision.date);
  expect([...dates].sort()).toEqual(dates);
  expect(new Set(DECISIONS.map((decision) => decision.id)).size).toBe(DECISIONS.length);
  for (const decision of DECISIONS) expect(decision.source.href).toStartWith("https://github.com/Noisemaker111/jgengine/");
});
