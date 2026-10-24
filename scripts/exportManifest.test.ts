import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { publishListsFrom } from "./check-release-set";
import {
  computeExposedSubpaths,
  computeManifest,
  emittedFilesForPackageDir,
  exposedSubpathsForPackageDir,
  isForbiddenSubpath,
  publishedPackages,
  readManifest,
  readPackageJson,
} from "./exportManifest";

describe("published export manifest", () => {
  const manifest = readManifest();

  test("every published package has a reviewed set of public subpaths", () => {
    const names = publishedPackages.map((pkg) => readPackageJson(pkg).name);
    expect(Object.keys(manifest).sort()).toEqual([...names].sort());
    for (const subpaths of Object.values(manifest)) {
      expect(subpaths.length).toBeGreaterThan(0);
    }
  });

  test("real exposed subpaths match the committed manifest (no accidental public API)", () => {
    expect(computeManifest()).toEqual(manifest);
  });

  test("no test fixture or internal-only subpath is publicly importable", () => {
    for (const [name, subpaths] of Object.entries(manifest)) {
      const leaked = subpaths.filter(isForbiddenSubpath);
      expect({ package: name, leaked }).toEqual({ package: name, leaked: [] });
    }
  });

  test("@jgengine/node no longer exposes its test fixtures subpath", () => {
    const node = readPackageJson("node").name;
    expect(manifest[node]).not.toContain("./testFixtures");
    expect(computeExposedSubpaths("node")).not.toContain("./testFixtures");
  });
});

test("the manifest tracks exactly the packages the publish workflow ships", () => {
  const workflow = readFileSync(join(import.meta.dir, "..", ".github", "workflows", "publish.yml"), "utf8");
  const [shipped] = publishListsFrom(workflow);
  expect([...publishedPackages].map((pkg) => String(pkg)).sort()).toEqual([...shipped!].sort());
});

describe("public subpaths come from source, not dist", () => {
  let pkgDir: string;
  const wildcardExports = { "./*": { types: "./dist/*.d.ts", default: "./dist/*.js" } };
  const write = (rel: string): void => {
    const full = join(pkgDir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, "export {};\n");
  };

  beforeEach(() => {
    pkgDir = mkdtempSync(join(tmpdir(), "export-manifest-"));
    mkdirSync(join(pkgDir, "src"), { recursive: true });
    writeFileSync(
      join(pkgDir, "tsconfig.build.json"),
      JSON.stringify({
        compilerOptions: { rootDir: "src" },
        include: ["src"],
        exclude: ["src/**/*.test.ts", "src/mcp/cli.ts", "src/recipes/snippets"],
      }),
    );
  });

  afterEach(() => {
    rmSync(pkgDir, { recursive: true, force: true });
  });

  test("a new src file is a public subpath before any build", () => {
    write("src/world.ts");
    write("src/Panel.tsx");
    expect(exposedSubpathsForPackageDir(pkgDir, wildcardExports)).toEqual(["./Panel", "./world"]);
  });

  test("an orphaned dist/*.js with no src counterpart is not a public subpath", () => {
    write("src/world.ts");
    write("dist/world.js");
    write("dist/devtools/urlFlags.js");
    expect(exposedSubpathsForPackageDir(pkgDir, wildcardExports)).toEqual(["./world"]);
  });

  test("build-excluded sources, tests and declarations are not public subpaths", () => {
    write("src/world.ts");
    write("src/world.test.ts");
    write("src/mcp/cli.ts");
    write("src/recipes/snippets/demo.ts");
    write("src/ambient.d.ts");
    expect(emittedFilesForPackageDir(pkgDir)).toEqual(["dist/world"]);
  });
});
