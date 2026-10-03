import { describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  findCapabilities,
  loadCapabilityIndex,
  loadSkillRecipes,
  recipeCapabilities,
  parseCapabilities,
  renderFindResults,
  renderFindJsonResults,
  resolveSkillsDir,
  searchCapabilities,
  runFind,
  type CapabilityEntry,
} from "./find";

const UI_MD = `<!-- GENERATED — do not edit -->

# jgengine-ui — capability index

Reach for these before hand-rolling.

## use-panels — headless toggleable-window manager with keybind + ESC handling over the core panel model

- \`usePanels\` (function) · \`import { usePanels } from "@jgengine/react"\`

## panel-host — render a manager's open windows as draggable, closable, z-stacked dialogs above the HUD

- \`PanelHost\` (function) · \`import { PanelHost } from "@jgengine/react"\`

## hud-vitals — atomic purpose-named vitals bars (token-themed parts, not a finished HUD)

- \`BarTokens\` (interface) · \`import { BarTokens } from "@jgengine/react"\`
- \`barTokens\` (function) · \`import { barTokens } from "@jgengine/react"\`
`;

describe("parseCapabilities", () => {
  test("parses slug, description, symbols, and imports; slug ends at the first em-dash", () => {
    const entries = parseCapabilities(UI_MD, "jgengine-ui");
    expect(entries).toHaveLength(3);
    const host = entries.find((e) => e.slug === "panel-host")!;
    expect(host.skill).toBe("jgengine-ui");
    // description keeps its own " — " ("...dialogs above the HUD" had none, but slug split must be first-only)
    expect(host.description).toBe("render a manager's open windows as draggable, closable, z-stacked dialogs above the HUD");
    expect(host.symbols).toEqual(["PanelHost"]);
    expect(host.imports).toEqual(['import { PanelHost } from "@jgengine/react"']);
  });

  test("captures every bullet's symbol and import (multi-export capability)", () => {
    const vitals = parseCapabilities(UI_MD, "jgengine-ui").find((e) => e.slug === "hud-vitals")!;
    expect(vitals.symbols).toEqual(["BarTokens", "barTokens"]);
    expect(vitals.imports).toHaveLength(2);
  });

  test("ignores the H1 and preamble before the first capability heading", () => {
    const entries = parseCapabilities(UI_MD, "jgengine-ui");
    expect(entries.some((e) => e.slug.includes("capability index"))).toBe(false);
  });
});

describe("searchCapabilities", () => {
  const index = parseCapabilities(UI_MD, "jgengine-ui");

  test("all query tokens must appear somewhere in the row (AND semantics)", () => {
    expect(searchCapabilities(index, "toggleable window").map((e) => e.slug)).toContain("use-panels");
    expect(searchCapabilities(index, "toggleable submarine")).toHaveLength(0);
  });

  test("a name/slug hit ranks above an incidental description mention", () => {
    // "window" is in panel-host's description AND use-panels' description; "panel" is in both slugs.
    const ranked = searchCapabilities(index, "panel");
    expect(ranked[0]!.slug === "use-panels" || ranked[0]!.slug === "panel-host").toBe(true);
    // hud-vitals mentions neither "panel" — excluded entirely.
    expect(ranked.some((e) => e.slug === "hud-vitals")).toBe(false);
  });

  test("matches against import path and symbol, not just prose", () => {
    expect(searchCapabilities(index, "PanelHost").map((e) => e.slug)).toEqual(["panel-host"]);
    expect(searchCapabilities(index, "@jgengine/react").length).toBe(3);
  });

  test("tokens match whole stemmed words, not substrings", () => {
    const rows = [
      ...index,
      { skill: "jgengine-gameplay", slug: "territory", description: "resolve a claim on a plot", imports: [], symbols: [] },
      { skill: "jgengine-world", slug: "aim-direction", description: "aim a shot from the eye", imports: [], symbols: [] },
    ];
    expect(searchCapabilities(rows, "aim").map((e) => e.slug)).toEqual(["aim-direction"]);
    expect(searchCapabilities(index, "windows").map((e) => e.slug)).toContain("use-panels");
    expect(searchCapabilities(index, "panels hosting").map((e) => e.slug)).toContain("panel-host");
  });

  test("stopwords drop and a multi-word query also matches its words joined", () => {
    const rows = [{ skill: "jgengine-world", slug: "world-item-pickup", description: "walk-over item pickup", imports: [], symbols: [] }];
    expect(searchCapabilities(rows, "pick up").map((e) => e.slug)).toEqual(["world-item-pickup"]);
    expect(searchCapabilities(index, "a toggleable window for the bag").length).toBe(0);
    expect(searchCapabilities(index, "a toggleable window").map((e) => e.slug)).toContain("use-panels");
  });

  test("with no full match, the rows carrying the most tokens come back flagged partial", () => {
    const result = findCapabilities(index, "toggleable submarine");
    expect(result.partial).toBe(true);
    expect(result.matches.map((e) => e.slug)).toEqual(["use-panels"]);
    expect(renderFindResults(result.matches, "toggleable submarine", true)).toContain("nothing matched every word");
  });

  test("an empty query matches nothing", () => {
    expect(searchCapabilities(index, "   ")).toHaveLength(0);
  });
});

describe("renderFindResults", () => {
  const index = parseCapabilities(UI_MD, "jgengine-ui");

  test("shows the skill, slug, description, and import for each match", () => {
    const out = renderFindResults(searchCapabilities(index, "toggleable window"), "toggleable window");
    expect(out).toContain("[jgengine-ui] use-panels");
    expect(out).toContain('import { usePanels } from "@jgengine/react"');
  });

  test("no-match output points at broader discovery, not a dead end", () => {
    const out = renderFindResults([], "flux capacitor");
    expect(out).toContain("no shipped capability matched");
    expect(out).toContain("npx jgengine skills --all");
  });

  test("text respects a caller's limit and preserves total counts", () => {
    const out = renderFindResults(index, "ui", false, 1);
    expect(out).toContain("3 shipped capabilities");
    expect(out).toContain("[jgengine-ui] use-panels");
    expect(out).not.toContain("[jgengine-ui] panel-host");
    expect(out).toContain("2 more");
  });

  test("JSON preserves ranking, import and recipe rows, and truncation metadata", () => {
    const rows = [...index, ...recipeCapabilities()];
    const out = JSON.parse(renderFindJsonResults(rows, "ui camera", true, 4));
    expect(out).toEqual({ query: "ui camera", total: rows.length, partial: true, truncated: true, matches: rows.slice(0, 4) });
    expect(out.matches[0].imports).toEqual(index[0]!.imports);
    expect(out.matches[3].skill).toBe("recipe");
    expect(JSON.parse(renderFindJsonResults([], "unknown"))).toEqual({
      query: "unknown", total: 0, partial: false, truncated: false, matches: [],
    });
    expect(JSON.parse(renderFindJsonResults(index, "ui", false, 3)).truncated).toBe(false);
  });
});

describe("runFind flags", () => {
  test.each([
    ["inventory", "--unknown"],
    ["inventory", "--json", "--json"],
    ["inventory", "--limit"],
    ["inventory", "--limit", "--json"],
    ["inventory", "--limit", "0"],
    ["inventory", "--limit", "-1"],
    ["inventory", "--limit", "1.5"],
    ["inventory", "--limit", "101"],
    ["inventory", "--limit", "1e1"],
    ["inventory", "--limit=2", "--limit", "3"],
  ])("rejects invalid options %j", (...argv) => {
    const log = spyOn(console, "log").mockImplementation(() => {});
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(runFind(argv)).toBe(1);
      expect(log).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });

  test("help documents JSON and accepts limit values without treating them as intent", () => {
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      expect(runFind(["--json", "--limit", "1", "--help"])).toBe(0);
      expect(String(log.mock.calls[0]?.[0])).toContain("--limit N");
      expect(runFind(["--limit=100", "-h"])).toBe(0);
      expect(runFind(["--json", "--limit", "2"])).toBe(1);
    } finally {
      log.mockRestore();
    }
  });
});

describe("loadCapabilityIndex + resolveSkillsDir (disk)", () => {
  test("reads capabilities.md from each domain subdir and skips domains without one", () => {
    const dir = mkdtempSync(join(tmpdir(), "jg-find-"));
    try {
      mkdirSync(join(dir, "jgengine-ui"), { recursive: true });
      mkdirSync(join(dir, "jgengine-empty"), { recursive: true });
      writeFileSync(join(dir, "jgengine-ui", "capabilities.md"), UI_MD);
      writeFileSync(join(dir, "jgengine-empty", "SKILL.md"), "# no capabilities here");
      const index = loadCapabilityIndex(dir);
      expect(index).toHaveLength(3);
      expect(new Set(index.map((e: CapabilityEntry) => e.skill))).toEqual(new Set(["jgengine-ui"]));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("indexes skill recipe docs and CLI recipes as rows", () => {
    const dir = mkdtempSync(join(tmpdir(), "jg-find-recipes-"));
    try {
      mkdirSync(join(dir, "jgengine-world", "recipes"), { recursive: true });
      writeFileSync(
        join(dir, "jgengine-world", "recipes", "vehicle-feel.md"),
        "# Recipe — vehicle feel\n\n**What this wires:** a ground vehicle that feels right.\n",
      );
      const rows = loadSkillRecipes(dir);
      expect(rows).toEqual([
        {
          skill: "jgengine-world",
          slug: "recipe/vehicle-feel",
          description: "vehicle feel — a ground vehicle that feels right.",
          imports: ["read .claude/skills/jgengine-world/recipes/vehicle-feel.md"],
          symbols: [],
        },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(searchCapabilities(recipeCapabilities(), "third person camera").map((e) => e.slug)).toEqual([
      "third-person-camera",
    ]);
  });

  test("resolveSkillsDir finds a package root that has both skills/ and package.json", () => {
    const root = mkdtempSync(join(tmpdir(), "jg-pkg-"));
    try {
      mkdirSync(join(root, "skills", "jgengine-ui"), { recursive: true });
      writeFileSync(join(root, "package.json"), JSON.stringify({ name: "jgengine" }));
      writeFileSync(join(root, "skills", "jgengine-ui", "capabilities.md"), UI_MD);
      const nested = join(root, "dist", "cli");
      mkdirSync(nested, { recursive: true });
      expect(resolveSkillsDir(nested)).toBe(join(root, "skills"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("resolveSkillsDir returns null when no package root is found", () => {
    const orphan = mkdtempSync(join(tmpdir(), "jg-orphan-"));
    try {
      expect(resolveSkillsDir(orphan)).toBeNull();
    } finally {
      rmSync(orphan, { recursive: true, force: true });
    }
  });
});
