import { describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  baselineVersion,
  compareSemver,
  collectInstalled,
  parseChangelogMarkdown,
  releasesBetween,
  renderUpgradeReport,
  runUpgrade,
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

describe("workspace catalog upgrade reports", () => {
  async function fixture(run: (root: string, project: string) => Promise<void>) {
    const root = mkdtempSync(join(tmpdir(), "jgengine-upgrade-catalog-"));
    const project = join(root, "games", "probe");
    mkdirSync(project, { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ workspaces: {
      packages: ["games/*"], catalog: { "@jgengine/core": "^0.18.1" }, catalogs: { ui: { "@jgengine/react": "0.18.0" } },
    } }));
    writeFileSync(join(project, "package.json"), JSON.stringify({ dependencies: { "@jgengine/core": "catalog:", "@jgengine/react": "catalog:ui" } }));
    try { await run(root, project); } finally { rmSync(root, { recursive: true, force: true }); }
  }

  test("uses hoisted installed versions before catalog declarations, and nearest installs before hoisted ones", async () => {
    await fixture(async (root, project) => {
      const core = join(root, "node_modules", "@jgengine", "core");
      mkdirSync(core, { recursive: true });
      writeFileSync(join(core, "package.json"), '{"version":"0.17.0"}');
      const packages = collectInstalled(project);
      expect(packages[0]?.installed).toBe("0.17.0");
      expect(packages[0]?.resolvedDeclared).toBe("^0.18.1");
      expect(packages[1]?.resolvedDeclared).toBe("0.18.0");
      expect(baselineVersion(packages)).toBe("0.17.0");
      const local = join(project, "node_modules", "@jgengine", "core");
      mkdirSync(local, { recursive: true });
      writeFileSync(join(local, "package.json"), '{"version":"0.16.0"}');
      expect(collectInstalled(project)[0]?.installed).toBe("0.16.0");
    });
  });

  test("reports a declared catalog baseline without installs and leaves both manifests unchanged", async () => {
    await fixture(async (root, project) => {
      const before = [root, project].map(dir => readFileSync(join(dir, "package.json"), "utf8"));
      const fetch = spyOn(globalThis, "fetch").mockImplementation(async input => new Response(String(input).includes("registry.npmjs.org") ? '{"version":"0.19.0"}' : "## 0.19.0\n\n### Migrate\n\n- migrate the fixture\n"));
      const log = spyOn(console, "log").mockImplementation(() => {});
      try {
        expect(baselineVersion(collectInstalled(project))).toBe("0.18.0");
        expect(await runUpgrade([project])).toBe(0);
        const report = String(log.mock.calls[0]?.[0]);
        expect(report).toContain("declared baseline 0.18.0");
        expect(report).toContain("declared catalog: → ^0.18.1");
        expect(report).toContain("(not installed)");
        expect(report).toContain(`${join(root, "package.json")} workspaces.catalog`);
        expect(report).toContain("workspaces.catalogs.ui");
        expect(report).toContain("migrate the fixture");
        expect(report).not.toContain("bump every @jgengine/* pin");
        expect(await runUpgrade([project, "--json"])).toBe(0);
        const json = JSON.parse(String(log.mock.calls[1]?.[0]));
        expect(json.baselineSource).toBe("declared");
        expect(json.installed).toBe("0.18.0");
        expect(json.packages.every((entry: { installed: string | null }) => entry.installed === null)).toBe(true);
        expect([root, project].map(dir => readFileSync(join(dir, "package.json"), "utf8"))).toEqual(before);
      } finally { fetch.mockRestore(); log.mockRestore(); }
    });
  });

  test("an unresolved catalog refuses a migration report even when a package is installed", async () => {
    await fixture(async (root, project) => {
      writeFileSync(join(root, "package.json"), JSON.stringify({ workspaces: { packages: ["games/*"], catalog: {} } }));
      const core = join(root, "node_modules", "@jgengine", "core");
      mkdirSync(core, { recursive: true });
      writeFileSync(join(core, "package.json"), '{"version":"0.18.1"}');
      const fetch = spyOn(globalThis, "fetch");
      const error = spyOn(console, "error").mockImplementation(() => {});
      try {
        expect(baselineVersion(collectInstalled(project))).toBeNull();
        expect(await runUpgrade([project])).toBe(1);
        expect(String(error.mock.calls[0]?.[0])).toContain("missing or malformed entry");
        expect(fetch).not.toHaveBeenCalled();
      } finally { fetch.mockRestore(); error.mockRestore(); }
    });
  });

  test("ordinary npm declarations retain their existing collected shape and baseline", async () => {
    await fixture(async (_root, project) => {
      writeFileSync(join(project, "package.json"), JSON.stringify({ dependencies: { "@jgengine/core": "^0.18.1", "@jgengine/github": "^1.0.0" } }));
      expect(collectInstalled(project)).toEqual([{ name: "@jgengine/core", declared: "^0.18.1", installed: null }]);
      expect(baselineVersion(collectInstalled(project))).toBe("0.18.1");
    });
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
    const report = renderUpgradeReport([{ name: "@jgengine/core", declared: "^0.13.0", installed: "0.13.0" }], "0.13.0", "0.13.0", [], "test");
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
