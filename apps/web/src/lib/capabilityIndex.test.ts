import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { parseCapabilityIndex } from "./capabilityIndex";
import { parseGameReadme } from "./gameReadme";
import { BLUEPRINTS } from "./blueprints";

const skillsDir = join(import.meta.dir, "../../../../.claude/skills");

function loadAll() {
  return readdirSync(skillsDir)
    .filter((name) => existsSync(join(skillsDir, name, "capabilities.md")))
    .flatMap((name) => parseCapabilityIndex(readFileSync(join(skillsDir, name, "capabilities.md"), "utf8"), name));
}

describe("parseCapabilityIndex", () => {
  test("reads every intent heading with its imports", () => {
    const rows = parseCapabilityIndex(
      [
        "# x — capability index",
        "",
        "## loot-table — register loot tables and roll weighted randomized drops",
        "",
        '- `createLootTable` (function) · `import { createLootTable } from "@jgengine/core/loot"`',
        "",
        "## empty — nothing below",
      ].join("\n"),
      "jgengine-gameplay",
    );
    expect(rows).toEqual([
      {
        skill: "jgengine-gameplay",
        key: "loot-table",
        summary: "register loot tables and roll weighted randomized drops",
        exports: [
          { symbol: "createLootTable", kind: "function", importLine: 'import { createLootTable } from "@jgengine/core/loot"' },
        ],
      },
    ]);
  });

  test("parses the committed skill indexes", () => {
    const rows = loadAll();
    expect(rows.length).toBeGreaterThan(300);
    for (const row of rows) expect(row.exports[0]!.importLine.startsWith("import ")).toBe(true);
  });

  test("every landing-page blueprint names a real capability", () => {
    const keys = new Set(loadAll().map((row) => `${row.skill}/${row.key}`));
    for (const blueprint of BLUEPRINTS) {
      for (const ref of blueprint.blocks) expect(keys.has(ref)).toBe(true);
    }
  });
});

describe("parseGameReadme", () => {
  test("reads the games table", () => {
    const table = [
      "| Game | Id | Description |",
      "| --- | --- | --- |",
      "| Vice Isle | `vice-isle` | GTA / Borderlands open world |",
    ].join("\n");
    expect(parseGameReadme(table)).toEqual({ "vice-isle": { title: "Vice Isle", blurb: "GTA / Borderlands open world" } });
  });
});
