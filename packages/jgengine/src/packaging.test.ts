import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(pkgRoot, "..", "..");

interface PackageJson {
  name: string;
  version: string;
  bin?: Record<string, string>;
  files?: string[];
  exports?: Record<string, unknown>;
  publishConfig?: { access?: string };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

describe("jgengine CLI packaging", () => {
  const pkg = readJson<PackageJson>(join(pkgRoot, "package.json"));

  test("publishes the unscoped name agents install as npx jgengine", () => {
    expect(pkg.name).toBe("jgengine");
    expect(pkg.publishConfig?.access).toBe("public");
  });

  test("ships a bin entry that resolves under dist", () => {
    expect(pkg.bin?.jgengine).toBe("dist/cli/index.js");
    expect(pkg.files).toContain("dist");
  });

  test("source CLI entry has a node shebang for npm bin installs", () => {
    const cli = readFileSync(join(pkgRoot, "src", "cli", "index.ts"), "utf8");
    expect(cli.includes("#!/usr/bin/env node")).toBe(true);
  });

  test("publish workflow includes jgengine in the publish order", () => {
    const workflow = readFileSync(join(repoRoot, ".github", "workflows", "publish.yml"), "utf8");
    expect(workflow).toMatch(/for p in core ws sql react convex node shell assets jgengine/);
    expect(workflow).toContain("packages/*/package.json");
  });

  test("package layout matches what npm pack would ship after build", () => {
    expect(existsSync(join(pkgRoot, "src", "cli", "index.ts"))).toBe(true);
    expect(existsSync(join(pkgRoot, "tsconfig.build.json"))).toBe(true);
    expect(pkg.exports?.["."]).toBeDefined();
  });
});
