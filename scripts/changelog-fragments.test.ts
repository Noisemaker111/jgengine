import { expect, test } from "bun:test";
import { foldFragments } from "./changelog-fragments";
import { parseSections, sectionLines, splitComment } from "./release";

const MARKDOWN = `# Changelog

## [Unreleased]

<!--
guidance
-->

### Changed

- Existing note.

## 0.17.0

### Added

- Older note.
`;

test("folds fragment bullets into matching and new sections in canonical order", () => {
  const next = foldFragments(MARKDOWN, [
    "### Changed\n\n- From PR one,\n  wrapped.\n",
    "### Migrate\n\n- Rename it.\n\n### Added\n\n- New export.\n",
  ]);
  const unreleased = sectionLines(next, "## [Unreleased]").join("\n");
  expect(unreleased).toContain("guidance");
  expect(unreleased.indexOf("### Migrate")).toBeLessThan(unreleased.indexOf("### Added"));
  expect(unreleased.indexOf("### Added")).toBeLessThan(unreleased.indexOf("### Changed"));
  const sections = parseSections(splitComment(sectionLines(next, "## [Unreleased]")).body);
  expect(sections.migrate).toEqual(["Rename it."]);
  expect(sections.added).toEqual(["New export."]);
  expect(sections.changed).toEqual(["Existing note.", "From PR one, wrapped."]);
  expect(sectionLines(next, "## 0.17.0").join("\n")).toContain("Older note.");
});

test("no fragments leaves the document untouched; a headingless fragment throws", () => {
  expect(foldFragments(MARKDOWN, [])).toBe(MARKDOWN);
  expect(() => foldFragments(MARKDOWN, ["- no heading"])).toThrow();
});
