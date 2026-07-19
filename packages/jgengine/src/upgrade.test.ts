import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  baselineVersion,
  compareSemver,
  parseChangelogMarkdown,
  releasesBetween,
  renderUpgradeReport,
} from "./upgrade";

const repoChangelog = readFileSync(join(import.meta.dir, "..", "..", "..", "CHANGELOG.md"), "utf8");

describe("parseChangelogMarkdown", () => {
  test("parses the repo changelog into versioned releases with all four buckets", () => {
    const releases = parseChangelogMarkdown(repoChangelog);
    expect(releases.length).toBeGreaterThanOrEqual(5);
    const latest = releases.find((entry) => entry.version === "0.13.0");
    expect(latest).toBeDefined();
    expect(latest!.migrate.length).toBeGreaterThan(0);
    expect(latest!.added.length).toBeGreaterThan(0);
    expect(latest!.changed.length).toBeGreaterThan(0);
    expect(latest!.added.join("\n")).toContain("InventoryGrid");
  });

  test("joins wrapped bullet continuation lines", () => {
    const releases = parseChangelogMarkdown("## 1.2.3\n\n### Added\n\n- first line\n  continues here\n- second\n");
    expect(releases[0].added).toEqual(["first line continues here", "second"]);
  });

  test("ignores prose outside sections and unknown sections", () => {
    const releases = parseChangelogMarkdown("intro prose\n\n## 2.0.0\n\nstray\n\n### Notes\n\n- ignored\n\n### Removed\n\n- gone\n");
    expect(releases[0].removed).toEqual(["gone"]);
    expect(releases[0].added).toEqual([]);
  });
});

describe("compareSemver / releasesBetween", () => {
  test("orders numerically, not lexically", () => {
    expect(compareSemver("0.9.0", "0.13.0")).toBeLessThan(0);
    expect(compareSemver("1.0.0", "0.99.0")).toBeGreaterThan(0);
    expect(compareSemver("0.13.0", "0.13.0")).toBe(0);
  });

  test("returns releases strictly after installed up to latest, oldest first", () => {
    const releases = parseChangelogMarkdown(repoChangelog);
    const span = releasesBetween(releases, "0.11.0", "0.13.0");
    expect(span.map((entry) => entry.version)).toEqual(["0.12.0", "0.13.0"]);
    expect(releasesBetween(releases, "0.13.0", "0.13.0")).toEqual([]);
  });
});

describe("baselineVersion", () => {
  test("takes the lowest installed lockstep version, falling back to declared pins", () => {
    expect(
      baselineVersion([
        { name: "@jgengine/core", declared: "^0.13.0", installed: "0.13.0" },
        { name: "@jgengine/react", declared: "^0.12.0", installed: "0.12.0" },
        { name: "@jgengine/shell", declared: "^0.12.0", installed: null },
      ]),
    ).toBe("0.12.0");
    expect(baselineVersion([])).toBeNull();
  });
});

describe("renderUpgradeReport", () => {
  const packages = [{ name: "@jgengine/core", declared: "^0.12.0", installed: "0.12.0" }];

  test("up to date has no migrate/adopt sections", () => {
    const report = renderUpgradeReport(packages, "0.13.0", "0.13.0", [], "test");
    expect(report).toContain("Up to date");
    expect(report).not.toContain("Adopt");
  });

  test("crossing a release leads with Migrate then Adopt and ends with bump instructions", () => {
    const releases = releasesBetween(parseChangelogMarkdown(repoChangelog), "0.12.0", "0.13.0");
    const report = renderUpgradeReport(packages, "0.12.0", "0.13.0", releases, "test");
    expect(report.indexOf("Migrate (do these, in order):")).toBeGreaterThan(0);
    expect(report.indexOf("Migrate")).toBeLessThan(report.indexOf("Adopt"));
    expect(report).toContain("## 0.13.0");
    expect(report).toContain("bump every @jgengine/* pin to ^0.13.0");
    expect(report).toContain("@jgengine/core/meta/changelog");
  });
});
