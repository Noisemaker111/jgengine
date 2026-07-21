import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { distStalenessForPackageDir, scanStalePackages } from "./distStaleness";

const OLD = new Date("2020-01-01T00:00:00Z");
const NEW = new Date("2020-01-02T00:00:00Z");

function write(path: string, when: Date): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "export {};\n");
  utimesSync(path, when, when);
}

const BUILD_TSCONFIG = JSON.stringify({
  extends: "./tsconfig.json",
  compilerOptions: { noEmit: false, outDir: "dist", rootDir: "src" },
  include: ["src"],
  exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/mcp/cli.ts", "src/recipes/snippets"],
});

describe("distStalenessForPackageDir", () => {
  let pkgDir: string;

  beforeEach(() => {
    pkgDir = mkdtempSync(join(tmpdir(), "dist-staleness-"));
    writeFileSync(join(pkgDir, "tsconfig.build.json"), BUILD_TSCONFIG);
  });

  afterEach(() => {
    rmSync(pkgDir, { recursive: true, force: true });
  });

  test("returns null when every emitting source has a fresh dist counterpart", () => {
    write(join(pkgDir, "src", "index.ts"), OLD);
    write(join(pkgDir, "src", "world", "grid.ts"), OLD);
    write(join(pkgDir, "dist", "index.js"), NEW);
    write(join(pkgDir, "dist", "world", "grid.js"), NEW);
    expect(distStalenessForPackageDir(pkgDir)).toBeNull();
  });

  test("flags missing-dist when dist has never been built", () => {
    write(join(pkgDir, "src", "index.ts"), OLD);
    const result = distStalenessForPackageDir(pkgDir);
    expect(result?.kind).toBe("missing-dist");
  });

  test("flags missing-emit for a source with no compiled counterpart (partial build — #1503)", () => {
    write(join(pkgDir, "src", "index.ts"), OLD);
    write(join(pkgDir, "src", "vfx", "screenEffects.ts"), OLD);
    write(join(pkgDir, "dist", "index.js"), NEW);
    // dist/vfx/screenEffects.js never emitted (interrupted build)
    const result = distStalenessForPackageDir(pkgDir);
    expect(result?.kind).toBe("missing-emit");
    expect(result?.sourcePath).toBe("src/vfx/screenEffects.ts");
  });

  test("flags stale-emit when a source is newer than its compiled dist (#1310)", () => {
    write(join(pkgDir, "src", "index.ts"), NEW);
    write(join(pkgDir, "dist", "index.js"), OLD);
    const result = distStalenessForPackageDir(pkgDir);
    expect(result?.kind).toBe("stale-emit");
    expect(result?.sourcePath).toBe("src/index.ts");
  });

  test("does not flag build-excluded glob sources (test files) with no dist — no false positive (#1501)", () => {
    write(join(pkgDir, "src", "index.ts"), OLD);
    write(join(pkgDir, "dist", "index.js"), NEW);
    write(join(pkgDir, "src", "grid.test.ts"), OLD); // excluded, never emitted
    expect(distStalenessForPackageDir(pkgDir)).toBeNull();
  });

  test("does not flag an exact-file exclude (editor mcp/cli.ts) with no dist", () => {
    write(join(pkgDir, "src", "index.ts"), OLD);
    write(join(pkgDir, "dist", "index.js"), NEW);
    write(join(pkgDir, "src", "mcp", "cli.ts"), OLD); // excluded exact file
    expect(distStalenessForPackageDir(pkgDir)).toBeNull();
  });

  test("does not flag a build-excluded directory (jgengine recipes/snippets/*) with no dist", () => {
    write(join(pkgDir, "src", "index.ts"), OLD);
    write(join(pkgDir, "dist", "index.js"), NEW);
    write(join(pkgDir, "src", "recipes", "snippets", "loot.ts"), OLD); // excluded subtree
    expect(distStalenessForPackageDir(pkgDir)).toBeNull();
  });

  test("does not expect a .js for a hand-written .d.ts source", () => {
    write(join(pkgDir, "src", "index.ts"), OLD);
    write(join(pkgDir, "dist", "index.js"), NEW);
    write(join(pkgDir, "src", "types.d.ts"), OLD); // declarations emit no .js
    expect(distStalenessForPackageDir(pkgDir)).toBeNull();
  });

  test("returns null for a package with no tsconfig.build.json (nothing to emit)", () => {
    const other = mkdtempSync(join(tmpdir(), "no-build-"));
    try {
      write(join(other, "src", "index.ts"), OLD);
      expect(distStalenessForPackageDir(other)).toBeNull();
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
});

describe("scanStalePackages", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "dist-staleness-repo-"));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  function makePackage(name: string): string {
    const dir = join(repoRoot, "packages", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "tsconfig.build.json"), BUILD_TSCONFIG);
    return dir;
  }

  test("reports only the packages whose dist is stale/incomplete", () => {
    const fresh = makePackage("fresh");
    write(join(fresh, "src", "index.ts"), OLD);
    write(join(fresh, "dist", "index.js"), NEW);

    const partial = makePackage("core");
    write(join(partial, "src", "index.ts"), OLD);
    write(join(partial, "src", "vfx", "screenEffects.ts"), OLD);
    write(join(partial, "dist", "index.js"), NEW);

    const result = scanStalePackages(repoRoot);
    expect(result.map((r) => r.pkg).sort()).toEqual(["core"]);
    expect(result[0]?.staleness.kind).toBe("missing-emit");
  });

  test("honors the optional package allow-list", () => {
    const a = makePackage("a");
    write(join(a, "src", "index.ts"), NEW);
    write(join(a, "dist", "index.js"), OLD); // stale
    const b = makePackage("b");
    write(join(b, "src", "index.ts"), NEW);
    write(join(b, "dist", "index.js"), OLD); // stale

    expect(scanStalePackages(repoRoot, ["a"]).map((r) => r.pkg)).toEqual(["a"]);
  });

  test("returns empty when packages/ is absent", () => {
    expect(scanStalePackages(join(repoRoot, "nonexistent"))).toEqual([]);
  });
});
