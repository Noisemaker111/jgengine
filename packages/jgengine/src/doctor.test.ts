import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeGame } from "./create";
import { diagnose } from "./doctor";
import { sdkVersion } from "./pkg";

function scaffold(): string {
  const dir = join(mkdtempSync(join(tmpdir(), "jgengine-doctor-")), "probe-game");
  writeGame(dir, "probe-game", "Probe Game", "standalone");
  mkdirSync(join(dir, "node_modules", "@jgengine", "core"), { recursive: true });
  writeFileSync(join(dir, "node_modules", "@jgengine", "core", "package.json"), '{"version":"0.8.0"}');
  return dir;
}

function failingLabels(dir: string): string[] {
  return diagnose(dir)
    .filter((finding) => !finding.ok)
    .map((finding) => finding.label);
}

describe("diagnose", () => {
  test("checks resolved catalog drift and recognizes a hoisted SDK install", () => {
    const root = mkdtempSync(join(tmpdir(), "jgengine-doctor-catalog-"));
    const project = join(root, "games", "probe");
    mkdirSync(project, { recursive: true });
    const manifest = join(root, "package.json");
    const core = join(root, "node_modules", "@jgengine", "core");
    mkdirSync(core, { recursive: true });
    writeFileSync(join(core, "package.json"), '{"version":"0.18.1"}');
    writeFileSync(join(project, "package.json"), JSON.stringify({ dependencies: { "@jgengine/core": "catalog:", "@jgengine/react": "catalog:" } }));
    try {
      const workspace = { packages: ["games/*"], catalog: { "@jgengine/core": "0.18.1", "@jgengine/react": "0.18.0" } };
      writeFileSync(manifest, JSON.stringify({ workspaces: workspace }));
      const findings = diagnose(project);
      expect(findings.find(entry => entry.label === "@jgengine/* catalogs resolve")?.ok).toBe(true);
      expect(findings.find(entry => entry.label === "engine installed in node_modules")?.ok).toBe(true);
      const alignment = findings.find(entry => entry.label === "@jgengine/* versions aligned");
      expect(alignment?.ok).toBe(false);
      expect(alignment?.fix).toContain("0.18.1, 0.18.0");
      expect(alignment?.fix).toContain("workspace catalog");
      workspace.catalog["@jgengine/react"] = "0.18.1";
      writeFileSync(manifest, JSON.stringify({ workspaces: workspace }));
      expect(failingLabels(project)).not.toContain("@jgengine/* versions aligned");
      writeFileSync(manifest, JSON.stringify({ workspaces: { packages: ["games/*"], catalog: null } }));
      const missing = diagnose(project);
      expect(missing.find(entry => entry.label === "@jgengine/* catalogs resolve")?.ok).toBe(false);
      expect(missing.find(entry => entry.label === "@jgengine/* versions aligned")?.ok).toBe(false);
      expect(missing.find(entry => entry.label === "@jgengine/* catalogs resolve")?.fix).toContain(manifest);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  test("a generated 2D game has no unused editor dependency or editor styling error", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "jgengine-doctor-board-")), "board");
    writeGame(dir, "board", "Board", "standalone", undefined, { dimension: "2d" });
    expect(failingLabels(dir)).not.toContain("Tailwind @source covers @jgengine/editor (F2+E summon)");
    expect(JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).dependencies["@jgengine/editor"]).toBeUndefined();
  });
  test("compares the running CLI's SDK target with installed SDK versions, independently of declared ranges", () => {
    const dir = scaffold();
    const installed = join(dir, "node_modules", "@jgengine", "core", "package.json");
    writeFileSync(installed, '{"version":"99.0.0"}');
    const finding = diagnose(dir).find(entry => entry.label === "running CLI supports installed SDK minor");
    expect(finding?.ok).toBe(false);
    expect(finding?.fix).toContain("@jgengine/core@99.0.0");
    const [major, minor] = sdkVersion().split(".");
    writeFileSync(installed, JSON.stringify({ version: `${major}.${minor}.99` }));
    expect(failingLabels(dir)).not.toContain("running CLI supports installed SDK minor");
  });

  test("flags @jgengine/* version skew", () => {
    const dir = scaffold();
    const pkgPath = join(dir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { dependencies: Record<string, string> };
    pkg.dependencies["@jgengine/react"] = "^0.7.0";
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    expect(failingLabels(dir)).toContain("@jgengine/* versions aligned");
  });

  test("flags missing Tailwind @source coverage (the silently-unstyled HUD)", () => {
    const dir = scaffold();
    const cssPath = join(dir, "src", "index.css");
    writeFileSync(cssPath, readFileSync(cssPath, "utf8").replaceAll(/@source [^\n]+\n/g, ""));
    expect(failingLabels(dir)).toContain("Tailwind @source covers @jgengine/react and @jgengine/shell");
  });

  test("flags missing editor @source when the F2+E summon is wired (the all-white editor)", () => {
    const dir = scaffold();
    const cssPath = join(dir, "src", "index.css");
    // Drop only the editor @source, leaving react/shell coverage intact.
    writeFileSync(cssPath, readFileSync(cssPath, "utf8").replaceAll(/@source [^\n]*@jgengine\/editor[^\n]*\n/g, ""));
    expect(failingLabels(dir)).toContain("Tailwind @source covers @jgengine/editor (F2+E summon)");
  });

  test("flags workspace:* deps outside a workspace (escaped-monorepo copy)", () => {
    const dir = scaffold();
    const pkgPath = join(dir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { dependencies: Record<string, string> };
    pkg.dependencies["@jgengine/core"] = "workspace:*";
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    expect(failingLabels(dir)).toContain("workspace:* deps only inside a workspace");
  });

  test("flags a stray file at src/ top level", () => {
    const dir = scaffold();
    writeFileSync(join(dir, "src", "stray.ts"), "export const stray = 1;\n");
    expect(failingLabels(dir)).toContain("src/ holds only the skeleton (everything else under src/game/)");
  });

  test("allows optional skeleton files (preview.tsx, scene-ownership.json) at src/ top level", () => {
    const dir = scaffold();
    writeFileSync(join(dir, "src", "preview.tsx"), "export default function Preview() { return null; }\n");
    writeFileSync(join(dir, "src", "scene-ownership.json"), '{"version":1,"objects":[]}\n');
    expect(failingLabels(dir)).not.toContain("src/ holds only the skeleton (everything else under src/game/)");
  });

  test("passes installSaveEndpoint gating vacuously — the scaffold never calls it (GameHost owns it)", () => {
    const dir = scaffold();
    expect(readFileSync(join(dir, "src", "main.tsx"), "utf8")).not.toContain("installSaveEndpoint");
    expect(failingLabels(dir)).not.toContain("installSaveEndpoint calls gated behind import.meta.env.DEV");
  });

  test("flags an unguarded installSaveEndpoint call", () => {
    const dir = scaffold();
    writeFileSync(
      join(dir, "src", "game", "boot.ts"),
      `import { installSaveEndpoint } from "@jgengine/core/devtools/saveEndpoint";
installSaveEndpoint("/__jgengine/save", "probe-game");
`,
    );
    expect(failingLabels(dir)).toContain("installSaveEndpoint calls gated behind import.meta.env.DEV");
  });

  test("accepts a DEV-guarded installSaveEndpoint call", () => {
    const dir = scaffold();
    writeFileSync(
      join(dir, "src", "game", "boot.ts"),
      `import { installSaveEndpoint } from "@jgengine/core/devtools/saveEndpoint";
if (import.meta.env.DEV) installSaveEndpoint("/__jgengine/save", "probe-game");
`,
    );
    expect(failingLabels(dir)).not.toContain("installSaveEndpoint calls gated behind import.meta.env.DEV");
  });

  test("reports a missing project", () => {
    const dir = mkdtempSync(join(tmpdir(), "jgengine-doctor-empty-"));
    expect(failingLabels(dir)).toContain("package.json readable");
  });

  test("scaffold passes the prototype-look gate (models + cinematic default)", () => {
    const dir = scaffold();
    expect(failingLabels(dir)).not.toContain(
      "shipped look (models + cinematic lighting, not prototype boxes/flat)",
    );
  });

  test("flags a flat-look prototype without models", () => {
    const dir = scaffold();
    writeFileSync(
      join(dir, "src", "game.config.ts"),
      `import { defineGame } from "@jgengine/shell/defineGame";
export const game = defineGame({
  name: "Boxes",
  look: "flat",
  world: {},
  loop: {},
  content: { entityById: () => null },
  GameUI: () => null,
  camera: { perspective: "third" },
});
`,
    );
    expect(failingLabels(dir)).toContain(
      "shipped look (models + cinematic lighting, not prototype boxes/flat)",
    );
  });
});
