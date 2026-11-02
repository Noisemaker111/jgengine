import { describe, expect, test } from "bun:test";

import { sources } from "../sources";
import { FONT_LIBRARY } from "./fontLibrary";
import { HDRI_LIBRARY } from "./hdriLibrary";
import { LUT_GRADES } from "./lutGrades";
import { MATERIAL_LIBRARY } from "./materialLibrary";
import { MODEL_LIBRARY } from "./modelLibrary";

/** Every id that appears more than once, each named once. */
function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) twice.add(id);
    seen.add(id);
  }
  return [...twice];
}

// Two branches that each add the same entry pass alone and break beta together (#2881). Every list a
// game names entries from is checked here, so a duplicate fails the assets suite verify:fast runs.
const LISTS: readonly [string, readonly string[]][] = [
  ["font library", FONT_LIBRARY.map((entry) => entry.id)],
  ["HDRI library", HDRI_LIBRARY.map((entry) => entry.id)],
  ["colour grades", LUT_GRADES.map((entry) => entry.id)],
  ["material library", MATERIAL_LIBRARY.map((entry) => entry.name)],
  ["model library", MODEL_LIBRARY.map((entry) => entry.name)],
  // One catalog across providers: a lookup by id keeps one of two entries and drops the other silently.
  ["asset sources", sources.map((source) => source.id)],
  ["HDRI Poly Haven assets", HDRI_LIBRARY.map((entry) => entry.polyhaven)],
  ["font packages", FONT_LIBRARY.map((entry) => entry.package)],
];

describe("catalog ids", () => {
  test("a repeated id is found", () => {
    expect(duplicates(["ground/beach", "ground/mud", "ground/beach"])).toEqual(["ground/beach"]);
  });

  for (const [label, ids] of LISTS) {
    test(`the ${label} names every entry once`, () => {
      expect(ids.length).toBeGreaterThan(0);
      expect(duplicates(ids)).toEqual([]);
    });
  }
});
