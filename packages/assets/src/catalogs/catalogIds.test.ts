import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { sources } from "../sources";
import { FONT_LIBRARY } from "./fontLibrary";
import { HDRI_LIBRARY } from "./hdriLibrary";
import { LIBRARY_LISTS, libraryEntryNames, libraryIndexPath, renderLibraryIndex } from "./entryFiles";
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

// One file per entry turns a same-id collision into a git conflict on that file. The generated
// index must list exactly the files on disk, and each entry's id must be its file name.
describe("library entry files", () => {
  const root = join(import.meta.dir, "..", "..", "..", "..");

  for (const list of LIBRARY_LISTS) {
    test(`${list.dir}/index.ts lists exactly its entry files`, async () => {
      expect(libraryEntryNames(root, list).length).toBeGreaterThan(0);
      expect(readFileSync(join(root, libraryIndexPath(list)), "utf8")).toBe(await renderLibraryIndex(root, list));
    });
  }

  test("an entry whose id is not its file name, or a file the index misses, is caught", async () => {
    const scratch = join(root, ".scratch");
    mkdirSync(scratch, { recursive: true });
    const fixture = mkdtempSync(join(scratch, "library-index-"));
    try {
      const list = { dir: relative(root, fixture).split(sep).join("/"), key: "id", exportName: "THINGS", doc: "Things." };
      mkdirSync(join(fixture, "sub"));
      writeFileSync(join(fixture, "a.ts"), 'export default { id: "a" };\n');
      writeFileSync(join(fixture, "sub", "b.ts"), 'export default { id: "sub/b" };\n');
      const index = await renderLibraryIndex(root, list);
      expect(index).toContain('import subB from "./sub/b";');
      writeFileSync(join(fixture, "c.ts"), 'export default { id: "c" };\n');
      expect(await renderLibraryIndex(root, list)).not.toBe(index);
      writeFileSync(join(fixture, "d.ts"), 'export default { id: "a" };\n');
      await expect(renderLibraryIndex(root, list)).rejects.toThrow('d.ts: id is "a"; it must be "d"');
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
