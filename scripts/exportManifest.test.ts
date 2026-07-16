import { describe, expect, test } from "bun:test";
import {
  computeExposedSubpaths,
  computeManifest,
  distExists,
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
