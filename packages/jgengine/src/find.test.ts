import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  loadCapabilityIndex,
  parseCapabilities,
  renderFindResults,
  resolveSkillsDir,
  searchCapabilities,
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
