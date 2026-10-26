import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { compareSemver, lowestSdkVersion, parseChangelogMarkdown, releasesBetween, renderReleaseNotes } from "./releaseNotes";

const repoChangelog = readFileSync(join(import.meta.dir, "..", "..", "..", "CHANGELOG.md"), "utf8");

describe("parseChangelogMarkdown", () => {
  test("parses the repo changelog into versioned releases with all four buckets", () => {
    const releases = parseChangelogMarkdown(repoChangelog);
    expect(releases.length).toBeGreaterThanOrEqual(5);
    const release = releases.find((entry) => entry.version === "0.13.0");
    expect(release).toBeDefined();
    expect(release!.migrate.length).toBeGreaterThan(0);
    expect(release!.added.length).toBeGreaterThan(0);
    expect(release!.changed.length).toBeGreaterThan(0);
    expect(release!.added.join("\n")).toContain("InventoryGrid");
  });

  test("joins wrapped bullet continuation lines", () => {
    const releases = parseChangelogMarkdown("## 1.2.3\n\n### Added\n\n- first line\n  continues here\n- second\n");
    expect(releases[0]!.added).toEqual(["first line continues here", "second"]);
  });

  test("ignores prose outside sections and unknown sections", () => {
    const releases = parseChangelogMarkdown("intro prose\n\n## 2.0.0\n\nstray\n\n### Notes\n\n- ignored\n\n### Removed\n\n- gone\n");
    expect(releases[0]!.removed).toEqual(["gone"]);
    expect(releases[0]!.added).toEqual([]);
  });
});

describe("compareSemver / releasesBetween / lowestSdkVersion", () => {
  test("orders numerically, not lexically", () => {
    expect(compareSemver("0.9.0", "0.13.0")).toBeLessThan(0);
    expect(compareSemver("1.0.0", "0.99.0")).toBeGreaterThan(0);
    expect(compareSemver("0.13.0", "0.13.0")).toBe(0);
  });

  test("returns releases strictly after from up to to, oldest first", () => {
    const releases = parseChangelogMarkdown(repoChangelog);
    expect(releasesBetween(releases, "0.11.0", "0.13.0").map((entry) => entry.version)).toEqual(["0.12.0", "0.13.0"]);
    expect(releasesBetween(releases, "0.13.0", "0.13.0")).toEqual([]);
  });

  test("the baseline is the lowest stable pin; workspace and catalog specs have none", () => {
    expect(lowestSdkVersion(["^0.13.0", "0.12.0", "~0.12.4"])).toBe("0.12.0");
    expect(lowestSdkVersion(["workspace:*", "catalog:"])).toBeNull();
  });
});

describe("renderReleaseNotes", () => {
  test("crossing a release leads with Migrate then Adopt", () => {
    const releases = releasesBetween(parseChangelogMarkdown(repoChangelog), "0.12.0", "0.13.0");
    const report = renderReleaseNotes("0.12.0", "0.13.0", releases, "test");
    expect(report).toContain("@jgengine 0.12.0 → 0.13.0");
    expect(report).toContain("## 0.13.0");
    expect(report.indexOf("Migrate (do these, in order):")).toBeGreaterThan(0);
    expect(report.indexOf("Migrate")).toBeLessThan(report.indexOf("Adopt"));
    expect(report).toContain("@jgengine/core/meta/changelog");
  });

  test("a span with no notes says so", () => {
    expect(renderReleaseNotes("0.12.0", "0.13.0", [], "test")).toContain("No release notes cover this span");
  });
});
