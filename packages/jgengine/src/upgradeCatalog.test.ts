import { describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectInstalled, runUpgrade } from "./upgrade";

async function fixture(run: (root: string, project: string, text: string) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), "jgengine-upgrade-apply-"));
  const project = join(root, "games", "first");
  mkdirSync(project, { recursive: true });
  mkdirSync(join(root, "games", "second"), { recursive: true });
  const manifest = {
    private: true,
    workspaces: {
      packages: ["games/*"],
      catalog: { "@jgengine/core": "^0.17.0", "@jgengine/editor": "0.18.0", "jgengine": "0.16.0", "@jgengine/github": "^0.6.0", "react": "19.2.3" },
      catalogs: { ui: { "@jgengine/react": "~0.17.0", "custom-ui": "^2.0.0" } },
    },
    overrides: { "@jgengine/editor": "0.18.0" },
    authoring: { dirty: "preserve this existing edit", nested: [1, { enabled: true }] },
  };
  const text = JSON.stringify(manifest, null, 4) + "\n";
  writeFileSync(join(root, "package.json"), text);
  writeFileSync(join(project, "package.json"), JSON.stringify({ dependencies: { "@jgengine/core": "catalog:", "@jgengine/react": "catalog:ui", "unique-first": "^1.0.0" } }));
  writeFileSync(join(root, "games", "second", "package.json"), JSON.stringify({ dependencies: { "@jgengine/core": "catalog:", "unique-second": "3.2.1" } }));
  writeFileSync(join(root, "bun.lock"), "original lock sentinel");
  const fetch = spyOn(globalThis, "fetch").mockImplementation(async input => new Response(String(input).includes("registry.npmjs.org")
    ? JSON.stringify({ version: "0.18.1" }) : "## 0.18.1\n\n### Migrate\n\n- Rebuild both custom games\n"));
  const log = spyOn(console, "log").mockImplementation(() => {});
  const error = spyOn(console, "error").mockImplementation(() => {});
  try { await run(root, project, text); }
  finally { fetch.mockRestore(); log.mockRestore(); error.mockRestore(); rmSync(root, { recursive: true, force: true }); }
}

describe("workspace catalog upgrade authoring", () => {
  test("apply changes one root catalog, preserving editor override, per-game declarations, and lockfile", async () => {
    await fixture(async (root, project, text) => {
      const games = [project, join(root, "games", "second")].map(dir => readFileSync(join(dir, "package.json"), "utf8"));
      expect(await runUpgrade([project, "--apply", "--to", "0.18.1"])).toBe(0);
      expect(readFileSync(join(root, "package.json"), "utf8")).toBe(text.replace('"@jgengine/core": "^0.17.0"', '"@jgengine/core": "^0.18.1"').replace('"@jgengine/react": "~0.17.0"', '"@jgengine/react": "~0.18.1"'));
      expect([project, join(root, "games", "second")].map(dir => readFileSync(join(dir, "package.json"), "utf8"))).toEqual(games);
      expect(readFileSync(join(root, "bun.lock"), "utf8")).toBe("original lock sentinel");
    });
  });

  test("root plan exposes exact before/after contents and migrations without writing", async () => {
    await fixture(async (root, _project, text) => {
      const output = spyOn(console, "log");
      expect(await runUpgrade([root, "--plan", "--to", "0.18.1", "--json"])).toBe(0);
      const report = JSON.parse(String(output.mock.calls.at(-1)?.[0]));
      expect(report.plan.file).toBe(join(root, "package.json"));
      expect(report.plan.before).toBe(text);
      expect(report.plan.after).toContain('"@jgengine/core": "^0.18.1"');
      expect(report.plan.changes).toHaveLength(2);
      expect(report.releases[0].migrate).toEqual(["Rebuild both custom games"]);
      expect(report.installation).toBe("not-run");
      expect(readFileSync(join(root, "package.json"), "utf8")).toBe(text);
    });
  });
  test("--to before the directory is parsed and a differently composed leaf plans the whole root", async () => {
    await fixture(async (root, _project, text) => {
      const output = spyOn(console, "log");
      expect(await runUpgrade(["--to", "0.18.1", join(root, "games", "second"), "--plan", "--json"])).toBe(0);
      const report = JSON.parse(String(output.mock.calls.at(-1)?.[0]));
      expect(report.installed).toBe("0.17.0");
      expect(report.plan.changes.map((entry: { name: string }) => entry.name)).toEqual(["@jgengine/core", "@jgengine/react"]);
      expect(report.plan.preserved[0].name).toBe("@jgengine/editor");
      expect(readFileSync(join(root, "package.json"), "utf8")).toBe(text);
    });
  });

  test("the default root report is read-only and uses the oldest version in every catalog", async () => {
    await fixture(async (root, _project, text) => {
      const changed = text.replace('"@jgengine/react": "~0.17.0"', '"@jgengine/react": "~0.16.0"');
      writeFileSync(join(root, "package.json"), changed);
      const output = spyOn(console, "log");
      expect(await runUpgrade([root, "--json"])).toBe(0);
      const report = JSON.parse(String(output.mock.calls.at(-1)?.[0]));
      expect(report.installed).toBe("0.16.0");
      expect(report.plan).toBeUndefined();
      expect(report.targetSource).toBe("registry");
      expect(readFileSync(join(root, "package.json"), "utf8")).toBe(changed);
    });
  });

  test("prints migrations and catalog changes before an apply, refusing edits made while planning", async () => {
    await fixture(async (root, project, text) => {
      const file = join(root, "package.json");
      const output = spyOn(console, "log").mockImplementation(value => {
        if (String(value).startsWith("\nCatalog plan:")) writeFileSync(file, text.replace("preserve this existing edit", "new edit while planning"));
      });
      const errors = spyOn(console, "error");
      expect(await runUpgrade([project, "--apply", "--to", "0.18.1"])).toBe(1);
      expect(output.mock.calls.map(call => String(call[0])).join("\n")).toContain("Rebuild both custom games");
      expect(output.mock.calls.map(call => String(call[0])).join("\n")).toContain("workspaces.catalog.@jgengine/core: ^0.17.0 → ^0.18.1");
      expect(output.mock.calls.map(call => String(call[0])).join("\n")).not.toContain("preserve this existing edit");
      expect(errors.mock.calls.map(call => String(call[0])).join("\n")).toContain("changed while planning");
      expect(readFileSync(file, "utf8")).toBe(text.replace("preserve this existing edit", "new edit while planning"));
    });
  });

  test("apply verifies every affected published package and refuses an unavailable transitive SDK", async () => {
    await fixture(async (root, project, text) => {
      spyOn(globalThis, "fetch").mockImplementation(async input => {
        const url = String(input);
        if (!url.includes("registry.npmjs.org")) return new Response("## 0.18.1\n\n### Migrate\n\n- Rebuild both custom games\n");
        if (url.includes(encodeURIComponent("@jgengine/navbake"))) return new Response("unpublished", { status: 404 });
        return new Response(JSON.stringify({ version: "0.18.1", ...(url.includes(encodeURIComponent("@jgengine/react")) ? { dependencies: { "@jgengine/navbake": "^0.18.1" } } : {}) }));
      });
      const errors = spyOn(console, "error");
      expect(await runUpgrade([project, "--apply", "--to", "0.18.1"])).toBe(1);
      expect(String(errors.mock.calls.at(-1)?.[0])).toContain("@jgengine/navbake@0.18.1: registry returned HTTP 404");
      expect(readFileSync(join(root, "package.json"), "utf8")).toBe(text);
    });
  });

  test("missing registry metadata cannot authorize writing from changelog or installed candidate versions", async () => {
    await fixture(async (root, project, text) => {
      spyOn(globalThis, "fetch").mockImplementation(async input => new Response(String(input).includes("registry.npmjs.org") ? "unavailable" : "## 0.19.0\n\n### Migrate\n\n- Candidate only\n", { status: String(input).includes("registry.npmjs.org") ? 503 : 200 }));
      expect(await runUpgrade([project, "--apply"])).toBe(1);
      expect(readFileSync(join(root, "package.json"), "utf8")).toBe(text);
      const output = spyOn(console, "log");
      expect(await runUpgrade([project, "--json"])).toBe(0);
      const report = JSON.parse(String(output.mock.calls.at(-1)?.[0]));
      expect(report.targetSource).toBe("notes-only-unverified");
      expect(report.warnings.join(" ")).toContain("HTTP 503");
    });
  });

  test("new target without migration notes is not reported as up to date", async () => {
    await fixture(async (_root, project) => {
      spyOn(globalThis, "fetch").mockImplementation(async input => new Response(String(input).includes("registry.npmjs.org") ? '{"version":"0.18.1"}' : "unavailable", { status: String(input).includes("registry.npmjs.org") ? 200 : 503 }));
      const output = spyOn(console, "log");
      expect(await runUpgrade([project, "--json"])).toBe(0);
      const report = JSON.parse(String(output.mock.calls.at(-1)?.[0]));
      expect(report.upToDate).toBe(false);
      expect(report.warnings.join(" ")).toContain("Migration notes for 0.18.1 are unavailable");
    });
  });

  test("a mixed current SDK set is not up to date just because its oldest entry matches", async () => {
    await fixture(async (root) => {
      writeFileSync(join(root, "package.json"), JSON.stringify({ workspaces: { packages: ["games/*"], catalog: { "@jgengine/core": "0.18.1", "@jgengine/react": "0.19.0" } } }));
      const output = spyOn(console, "log");
      expect(await runUpgrade([root, "--json"])).toBe(0);
      expect(JSON.parse(String(output.mock.calls.at(-1)?.[0])).upToDate).toBe(false);
      expect(await runUpgrade([root])).toBe(0);
      expect(String(output.mock.calls.at(-1)?.[0])).toContain("SDK versions differ from target 0.18.1");
    });
  });

  test("a corrupt nearest install is an error rather than a hoisted or declared baseline", async () => {
    await fixture(async (root, project, text) => {
      const core = join(project, "node_modules", "@jgengine", "core"); mkdirSync(core, { recursive: true });
      writeFileSync(join(core, "package.json"), '{"version":42}');
      const errors = spyOn(console, "error");
      expect(await runUpgrade([project])).toBe(1);
      expect(String(errors.mock.calls.at(-1)?.[0])).toContain("invalid installed package metadata");
      expect(readFileSync(join(root, "package.json"), "utf8")).toBe(text);
    });
  });

  test.each([
    ["null", "package.json must be an object"],
    ['{"workspaces":{"packages":"games/*","catalog":{}}}', "workspaces.packages"],
    ['{"workspaces":{"packages":["games/*"],"catalog":[]}}', "malformed workspaces.catalog"],
    ['{"workspaces":{"packages":["games/*"],"catalogs":{"sdk":[]}}}', "malformed workspaces.catalogs.sdk"],
    ['{"workspaces":{"packages":["games/*"],"catalog":{"@jgengine/core":null}}}', "unsupported"],
    ['{"workspaces":{"packages":["games/*"],"catalog":{"@jgengine/core":"catalog:sdk"}}}', "unsupported"],
    ['{"workspaces":{"packages":["games/*"],"catalog":{"@jgengine/core":"^0.19.0"}}}', "refusing a downgrade"],
    ['{"workspaces":{"packages":["games/*"],"catalog":{"@jgengine/core":"0.17.0","@jgengine/core":"0.17.0"}}}', "duplicate JSON key"],
    ['{"workspaces":{"packages":["games/*"],"catalog":{"@jgengine/core":"0.17.0"}},"overrides":{"@jgengine/core":"0.17.0"}}', "override conflicts"],
    ['{broken}', "invalid JSON"],
  ])("refuses malformed or ambiguous root input %s", async (manifest, message) => {
    await fixture(async (root, project) => {
      writeFileSync(join(root, "package.json"), manifest);
      const errors = spyOn(console, "error");
      expect(await runUpgrade([root, "--apply", "--to", "0.18.1"])).toBe(1);
      expect(String(errors.mock.calls.at(-1)?.[0])).toContain(message);
      expect(readFileSync(join(root, "package.json"), "utf8")).toBe(manifest);
    });
  });

  test("separate cadence packages and direct pins are never catalog adoption targets", async () => {
    await fixture(async (root, project, text) => {
      writeFileSync(join(project, "package.json"), JSON.stringify({ dependencies: { "@jgengine/core": "^0.17.0", "@jgengine/github": "0.6.0", "jgengine": "0.16.0" } }));
      const before = readFileSync(join(project, "package.json"), "utf8");
      expect(await runUpgrade([project, "--apply", "--to", "0.18.1"])).toBe(0);
      expect(readFileSync(join(project, "package.json"), "utf8")).toBe(before);
      expect(readFileSync(join(root, "package.json"), "utf8")).toBe(text.replace('"@jgengine/core": "^0.17.0"', '"@jgengine/core": "^0.18.1"').replace('"@jgengine/react": "~0.17.0"', '"@jgengine/react": "~0.18.1"'));
    });
  });

  test("unknown flags and unstable targets leave files untouched", async () => {
    await fixture(async (root, project, text) => {
      for (const flags of [["--to"], ["--to", "0.19.0-beta.1"], ["--unknown"], ["--plan", "--apply"]]) expect(await runUpgrade([project, ...flags])).toBe(1);
      expect(readFileSync(join(root, "package.json"), "utf8")).toBe(text);
    });
  });

  test("the catalog changes both games while installed versions remain stale until install", async () => {
    await fixture(async (root, project, text) => {
      const core = join(root, "node_modules", "@jgengine", "core"); mkdirSync(core, { recursive: true });
      writeFileSync(join(core, "package.json"), '{"version":"0.17.0"}');
      expect(await runUpgrade([root, "--apply", "--to", "0.18.1"])).toBe(0);
      for (const game of [project, join(root, "games", "second")]) {
        const entry = collectInstalled(game).find(entry => entry.name === "@jgengine/core")!;
        expect(entry.resolvedDeclared).toBe("^0.18.1");
        expect(entry.installed).toBe("0.17.0");
      }
      expect(readFileSync(join(root, "bun.lock"), "utf8")).toBe("original lock sentinel");
      expect(readFileSync(join(root, "package.json"), "utf8")).not.toBe(text);
    });
  });

  test("JSON apply emits the review plan before writing and reports declaration-only success separately", async () => {
    await fixture(async (root, project, text) => {
      const output = spyOn(console, "log").mockImplementation(value => {
        const report = JSON.parse(String(value));
        expect(report.applyRequested).toBe(true);
        expect(report.installation).toBe("not-run");
        expect(report.plan.before).toBe(readFileSync(join(root, "package.json"), "utf8"));
      });
      const status = spyOn(console, "error");
      expect(await runUpgrade([project, "--apply", "--json", "--to", "0.18.1"])).toBe(0);
      expect(output).toHaveBeenCalledTimes(1);
      expect(String(status.mock.calls.at(-1)?.[0])).toContain("Updated declarations");
      expect(String(status.mock.calls.at(-1)?.[0])).toContain("install has not run");
      expect(readFileSync(join(root, "package.json"), "utf8")).not.toBe(text);
    });
  });

  test("escaped named catalog keys, compact JSON, and literal duplicate-looking text keep their exact style", async () => {
    await fixture(async (root, project) => {
      const file = join(root, "package.json");
      const text = '{"workspaces":{"packages":["games/*"],"catalogs":{"custom\\"ui":{"@jgengine/core":"~0.17.0"}}},"note":"\\"@jgengine/core\\":\\"~0.17.0\\""}';
      writeFileSync(file, text);
      expect(await runUpgrade([root, "--apply", "--to", "0.18.1"])).toBe(0);
      expect(readFileSync(file, "utf8")).toBe(text.replace('"@jgengine/core":"~0.17.0"', '"@jgengine/core":"~0.18.1"'));
    });
  });

  test("a registry version mismatch cannot mutate the root", async () => {
    await fixture(async (root, project, text) => {
      spyOn(globalThis, "fetch").mockImplementation(async () => new Response('{"version":"0.19.0"}'));
      const errors = spyOn(console, "error");
      expect(await runUpgrade([project, "--apply", "--to", "0.18.1"])).toBe(1);
      expect(String(errors.mock.calls.at(-1)?.[0])).toContain("registry returned version 0.19.0");
      expect(readFileSync(join(root, "package.json"), "utf8")).toBe(text);
    });
  });

  test("Rapier and Navbake are part of the lockstep catalog report", async () => {
    await fixture(async (root, project, text) => {
      const file = join(root, "package.json");
      const data = JSON.parse(text); data.workspaces.catalog["@jgengine/rapier"] = "0.17.0"; data.workspaces.catalog["@jgengine/navbake"] = "^0.17.0";
      writeFileSync(file, JSON.stringify(data));
      const output = spyOn(console, "log");
      expect(await runUpgrade([project, "--plan", "--json"])).toBe(0);
      const report = JSON.parse(String(output.mock.calls.at(-1)?.[0]));
      expect(report.plan.changes.map((entry: { name: string }) => entry.name)).toContain("@jgengine/rapier");
      expect(report.plan.changes.map((entry: { name: string }) => entry.name)).toContain("@jgengine/navbake");
      expect(report.verifiedPublished).toContain("@jgengine/rapier@0.18.1");
      expect(report.verifiedPublished).toContain("@jgengine/navbake@0.18.1");
    });
  });

  test("read-only reports retain installed comparator ranges and respect a stale leaf install in the baseline", async () => {
    await fixture(async (_root, project) => {
      const core = join(project, "node_modules", "@jgengine", "core"); mkdirSync(core, { recursive: true });
      writeFileSync(join(core, "package.json"), '{"version":"0.16.0"}');
      writeFileSync(join(project, "package.json"), '{"dependencies":{"@jgengine/core":">=0.16.0 <0.19.0"}}');
      const output = spyOn(console, "log");
      expect(await runUpgrade([project, "--json"])).toBe(0);
      expect(JSON.parse(String(output.mock.calls.at(-1)?.[0])).installed).toBe("0.16.0");
      expect(await runUpgrade([project, "--plan", "--json"])).toBe(0);
      const report = JSON.parse(String(output.mock.calls.at(-1)?.[0]));
      expect(report.installed).toBe("0.16.0");
      expect(report.baselineSource).toBe("mixed");
      expect(report.projectPackages[0].installed).toBe("0.16.0");
      expect(report.directDeclarationsUnchanged[0].declared).toBe(">=0.16.0 <0.19.0");
      expect(await runUpgrade([project, "--plan"])).toBe(0);
      expect(String(output.mock.calls.findLast(call => String(call[0]).startsWith("jgengine upgrade"))?.[0])).toContain("mixed baseline 0.16.0");
    });
  });

});
