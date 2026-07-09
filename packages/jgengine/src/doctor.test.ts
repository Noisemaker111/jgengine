import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeGame } from "./create";
import { diagnose } from "./doctor";

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

  test("reports a missing project", () => {
    const dir = mkdtempSync(join(tmpdir(), "jgengine-doctor-empty-"));
    expect(failingLabels(dir)).toContain("package.json readable");
  });
});
