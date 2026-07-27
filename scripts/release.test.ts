import { describe, expect, test } from "bun:test";
import { cutChangelog, lockstepBullet, mirrorEntry, parseSections, sectionLines, splitComment } from "./release";

const MARKDOWN = `# Changelog

## [Unreleased]

<!--
guidance
-->

### Migrate

- **A thing moved.** Do the step,
  which wraps across lines.

### Added

- **New export.** It exists.

### Fixed

- **A bug.** It is gone.

## 0.17.0

### Migrate

- Older note.
`;

describe("release cut", () => {
  test("parses authored bullets and folds Fixed into changed", () => {
    const { body } = splitComment(sectionLines(MARKDOWN, "## [Unreleased]"));
    const sections = parseSections(body);
    expect(sections.migrate).toEqual(["A thing moved. Do the step, which wraps across lines."]);
    expect(sections.added).toEqual(["New export. It exists."]);
    expect(sections.changed).toEqual(["A bug. It is gone."]);
    expect(sections.removed).toEqual([]);
  });

  test("renames the block, prepends the lockstep bullet, keeps a fresh Unreleased", () => {
    const next = cutChangelog(MARKDOWN, "0.18.0", lockstepBullet("0.18.0", "0.15.0", "0.5.0"));
    expect(next).toContain("## [Unreleased]");
    expect(next).toContain("## 0.18.0");
    expect(next).toContain("guidance");
    expect(next.indexOf("## 0.18.0")).toBeLessThan(next.indexOf("## 0.17.0"));
    expect(next.indexOf("^0.18.0")).toBeLessThan(next.indexOf("A thing moved"));
    expect(sectionLines(next, "## [Unreleased]").join("\n")).not.toContain("A thing moved");
    expect(sectionLines(next, "## 0.18.0").join("\n")).toContain("New export");
  });

  test("mirrors a typed entry at the top of the record", () => {
    const source = `export const CHANGELOG: Record<string, ChangelogEntry> = {\n  "0.17.0": {\n  },\n};\n`;
    const next = mirrorEntry(source, "0.18.0", { migrate: ["a"], added: [], changed: ["b"], removed: [] });
    expect(next.indexOf(`"0.18.0"`)).toBeLessThan(next.indexOf(`"0.17.0"`));
    expect(next).toContain(`    migrate: [\n      "a",\n    ],`);
    expect(next).toContain("    added: [],");
    expect(() => mirrorEntry(next, "0.18.0", { migrate: [], added: [], changed: [], removed: [] })).toThrow();
  });
});
