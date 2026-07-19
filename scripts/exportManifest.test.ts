import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  computeExposedSubpaths,
  computeManifest,
  distExists,
  exposedSubpathsForPackageDir,
  isForbiddenSubpath,
  publishedPackages,
  readManifest,
  readPackageJson,
} from "./exportManifest";

const built = publishedPackages.every((pkg) => distExists(pkg));

describe.if(built)("published export manifest", () => {
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

test("published package list is fixed and non-empty", () => {
  expect(publishedPackages.length).toBe(11);
});

describe("orphaned dist files are excluded from public subpaths", () => {
  let pkgDir: string;
  const wildcardExports = { "./*": { types: "./dist/*.d.ts", default: "./dist/*.js" } };
  const writeDistJs = (rel: string): void => {
    const full = join(pkgDir, "dist", `${rel}.js`);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, "export {};\n");
  };
  const writeSrcTs = (rel: string): void => {
    const full = join(pkgDir, "src", `${rel}.ts`);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, "export {};\n");
  };

  beforeEach(() => {
    pkgDir = mkdtempSync(join(tmpdir(), "export-manifest-"));
    mkdirSync(join(pkgDir, "dist"), { recursive: true });
    mkdirSync(join(pkgDir, "src"), { recursive: true });
  });

  afterEach(() => {
    rmSync(pkgDir, { recursive: true, force: true });
  });

  test("a dist/*.js with a live src/*.ts counterpart is a public subpath", () => {
    writeSrcTs("world");
    writeDistJs("world");
    expect(exposedSubpathsForPackageDir(pkgDir, wildcardExports)).toContain("./world");
  });

  test("an orphaned dist/*.js with no src counterpart is not a public subpath", () => {
    writeSrcTs("world");
    writeDistJs("world");
    // devtools/urlFlags.js lingers from a deleted source; it must not leak.
    writeDistJs("devtools/urlFlags");
    const subpaths = exposedSubpathsForPackageDir(pkgDir, wildcardExports);
    expect(subpaths).toContain("./world");
    expect(subpaths).not.toContain("./devtools/urlFlags");
  });

  test("a src/*.tsx source keeps its compiled dist/*.js as a public subpath", () => {
    const full = join(pkgDir, "src", "Panel.tsx");
    writeFileSync(full, "export {};\n");
    writeDistJs("Panel");
    expect(exposedSubpathsForPackageDir(pkgDir, wildcardExports)).toContain("./Panel");
  });
});
