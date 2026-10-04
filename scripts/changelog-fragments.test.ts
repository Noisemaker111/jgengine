import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

function checkerFixture(fragment: string | null, change: "docs" | "skip" | "source" = "docs") {
  const root = mkdtempSync(join(tmpdir(), "jg-changelog-gate-"));
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout.trim();
  };
  try {
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "changes"));
    for (const script of ["check-changelog.ts", "changelog-fragments.ts"]) {
      copyFileSync(join(import.meta.dir, script), join(root, "scripts", script));
    }
    writeFileSync(join(root, "CHANGELOG.md"), MARKDOWN);
    // The malformed note predates the diff: validating only new/modified notes misses it.
    if (fragment !== null) writeFileSync(join(root, "changes", "existing.md"), fragment);
    git("init", "--quiet");
    git("config", "user.name", "Changelog fixture");
    git("config", "user.email", "changelog-fixture@example.invalid");
    git("add", ".");
    git("commit", "--quiet", "-m", "baseline");
    const base = git("rev-parse", "HEAD");
    if (change !== "docs") {
      mkdirSync(join(root, "packages", "core", "src"), { recursive: true });
      writeFileSync(join(root, "packages", "core", "src", "internal.ts"), "export const refactored = true;\n");
    } else {
      writeFileSync(join(root, "README.md"), "Documentation only.\n");
    }
    git("add", ".");
    git("commit", "--quiet", "-m", change === "skip" ? "Internal refactor [skip changelog]" : "Clarify documentation");
    return {
      root,
      git,
      run: (baseRef = base) => spawnSync(process.execPath, ["scripts/check-changelog.ts"], {
        cwd: root,
        env: { ...process.env, CHANGELOG_BASE_REF: baseRef },
        encoding: "utf8",
        timeout: 10_000,
      }),
    };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

for (const scenario of ["docs", "unavailable-base", "skip"] as const) {
  test(`actual changelog checker rejects an existing headingless note before ${scenario} exemption`, () => {
    const fixture = checkerFixture("# Existing feature\n\nA release note without a recognized heading.\n", scenario === "skip" ? "skip" : "docs");
    try {
      const result = fixture.run(scenario === "unavailable-base" ? "missing-changelog-base" : undefined);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("changes/existing.md");
      expect(result.stderr).toContain("### Migrate/Added/Changed/Fixed/Removed");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
}

for (const fragment of ["### Notes\n\n- Unsupported section.\n", "### Added\n\n", "### Added\n\nProse without a bullet.\n"]) {
  test(`actual changelog checker rejects malformed existing format ${JSON.stringify(fragment)}`, () => {
    const fixture = checkerFixture(fragment);
    try {
      const result = fixture.run();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("changes/existing.md");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
}

test("actual changelog checker preserves valid-note and no-note exemptions", () => {
  for (const fragment of ["### Fixed\n\n- Existing repair,\n  with a wrapped explanation.\n", null]) {
    for (const scenario of ["docs", "unavailable-base", "skip"] as const) {
      const fixture = checkerFixture(fragment, scenario === "skip" ? "skip" : "docs");
      try {
        const result = fixture.run(scenario === "unavailable-base" ? "missing-changelog-base" : undefined);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain(scenario === "docs" ? "no published-SDK source changes" : "skipping.");
      } finally {
        rmSync(fixture.root, { recursive: true, force: true });
      }
    }
  }
});

test("actual changelog checker still requires a new note for nonexempt SDK changes", () => {
  const fixture = checkerFixture("### Added\n\n- Prior capability.\n", "source");
  try {
    expect(fixture.run().status).toBe(1);
    writeFileSync(join(fixture.root, "changes", "new.md"), "### Added\n\n- New capability.\n");
    fixture.git("add", "changes/new.md");
    fixture.git("commit", "--quiet", "-m", "Record new capability");
    const result = fixture.run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("changes/new.md records changes for 1 source file(s)");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
