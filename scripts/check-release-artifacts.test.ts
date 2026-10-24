import { describe, expect, test } from "bun:test";

import {
  checkPackage,
  publishDecision,
  publishedState,
  resolveExportTargets,
  unresolvableDependency,
} from "./check-release-artifacts";
import type { Registry, UnpackedPackage } from "./check-release-artifacts";

const TARBALL_BYTES = new Uint8Array([31, 139, 8, 0]);

const registryOf = (metadata: Record<string, unknown> | null, status = 200): Registry => ({
  metadata: async () => metadata,
  tarball: async () => (status === 200 ? { status, bytes: TARBALL_BYTES } : { status, bytes: null }),
});

const metadataWith = (name: string, version: string): Record<string, unknown> => ({
  name,
  versions: { [version]: { dist: { tarball: `https://registry.example.test/${name}-${version}.tgz` } } },
});

const unpackOf = (files: readonly string[], manifest: UnpackedPackage["manifest"]) => (): UnpackedPackage => ({
  dir: "/tmp/unpacked",
  files: new Set(files),
  manifest,
});

const CORE_EXPORTS = { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" }, "./*": { default: "./dist/*.js" } };

describe("published means present", () => {
  test("a tarball that 404s fails the package instead of trusting its metadata", async () => {
    const verdict = await checkPackage({
      name: "@jgengine/shell",
      version: "0.35.0",
      registry: registryOf(metadataWith("@jgengine/shell", "0.35.0"), 404),
      unpack: unpackOf([], {}),
    });
    expect(verdict.failures.length).toBe(1);
    expect(verdict.failures[0]).toContain("@jgengine/shell@0.35.0");
    expect(verdict.failures[0]).toContain("returned 404");
    expect(verdict.failures[0]).toContain("counts as unpublished");
  });

  test("metadata with no dist.tarball cannot be installed", async () => {
    const verdict = await checkPackage({
      name: "@jgengine/core",
      version: "0.35.0",
      registry: registryOf({ name: "@jgengine/core", versions: { "0.35.0": { dist: {} } } }),
      unpack: unpackOf([], {}),
    });
    expect(verdict.failures[0]).toContain("no dist.tarball");
  });

  test("a version the registry does not carry is unpublished", async () => {
    const verdict = await checkPackage({
      name: "@jgengine/core",
      version: "0.36.0",
      registry: registryOf(metadataWith("@jgengine/core", "0.35.0")),
      unpack: unpackOf([], {}),
    });
    expect(verdict.failures[0]).toContain("@jgengine/core@0.36.0");
    expect(verdict.failures[0]).toContain("not published");
  });

  test("a subpath the checkout exposes but the tarball lacks fails by name", async () => {
    const verdict = await checkPackage({
      name: "@jgengine/core",
      version: "0.35.0",
      declared: ["./agents/system"],
      registry: registryOf(metadataWith("@jgengine/core", "0.35.0")),
      unpack: unpackOf(["dist/index.js", "dist/index.d.ts"], { name: "@jgengine/core", version: "0.35.0", exports: CORE_EXPORTS }),
      importEntry: async () => undefined,
    });
    expect(verdict.failures.join("\n")).toContain("./agents/system resolves to dist/agents/system.js");
  });

  test("a tarball whose manifest names another version fails", async () => {
    const verdict = await checkPackage({
      name: "@jgengine/core",
      version: "0.34.0",
      registry: registryOf(metadataWith("@jgengine/core", "0.34.0")),
      unpack: unpackOf(["dist/index.js"], { name: "@jgengine/core", version: "0.35.0", exports: CORE_EXPORTS }),
    });
    expect(verdict.failures.join("\n")).toContain("would report the wrong version");
  });

  test("the main entry is imported from the unpacked directory", async () => {
    const imported: string[] = [];
    const verdict = await checkPackage({
      name: "@jgengine/core",
      version: "0.35.0",
      declared: ["."],
      registry: registryOf(metadataWith("@jgengine/core", "0.35.0")),
      unpack: unpackOf(["dist/index.js", "dist/index.d.ts"], { name: "@jgengine/core", version: "0.35.0", exports: CORE_EXPORTS }),
      importEntry: async (url) => {
        imported.push(url);
      },
    });
    expect(verdict.failures).toEqual([]);
    expect(imported.length).toBe(1);
    expect(imported[0]).toContain("dist/index.js");
    expect(verdict.checkedSubpaths).toBe(1);
  });

  test("an entry that throws fails the package", async () => {
    const verdict = await checkPackage({
      name: "@jgengine/core",
      version: "0.35.0",
      declared: ["."],
      registry: registryOf(metadataWith("@jgengine/core", "0.35.0")),
      unpack: unpackOf(["dist/index.js"], { name: "@jgengine/core", version: "0.35.0", exports: CORE_EXPORTS }),
      importEntry: async () => {
        throw new SyntaxError("Unexpected token 'export'");
      },
    });
    expect(verdict.failures.join("\n")).toContain("main entry dist/index.js failed to import");
  });

  test("a dependency this checkout has not installed is a note, not a failure", async () => {
    const verdict = await checkPackage({
      name: "@jgengine/react",
      version: "0.35.0",
      declared: ["."],
      registry: registryOf(metadataWith("@jgengine/react", "0.35.0")),
      unpack: unpackOf(["dist/index.js", "dist/index.d.ts"], {
        name: "@jgengine/react",
        version: "0.35.0",
        exports: CORE_EXPORTS,
        peerDependencies: { react: "^19.0.0" },
      } as UnpackedPackage["manifest"]),
      importEntry: async () => {
        throw new Error("Cannot find package 'react' imported from dist/index.js");
      },
    });
    expect(verdict.failures).toEqual([]);
    expect(verdict.notes.join("\n")).toContain("declared dependency react");
  });
});

describe("skip guard", () => {
  test("metadata without a tarball is a repair, never a skip", async () => {
    const missing = await publishedState(registryOf(metadataWith("@jgengine/shell", "0.35.0"), 404), "@jgengine/shell", "0.35.0");
    expect(missing).toEqual({ hasMetadata: true, hasVersion: true, tarballStatus: 404 });
    expect(publishDecision(missing)).toBe("repair");
  });

  test("a present tarball is skipped and an unpublished version is published", () => {
    expect(publishDecision({ hasMetadata: true, hasVersion: true, tarballStatus: 200 })).toBe("skip");
    expect(publishDecision({ hasMetadata: true, hasVersion: false, tarballStatus: null })).toBe("publish");
    expect(publishDecision({ hasMetadata: false, hasVersion: false, tarballStatus: null })).toBe("publish");
    expect(publishDecision({ hasMetadata: true, hasVersion: true, tarballStatus: null })).toBe("repair");
  });
});

describe("exports resolution", () => {
  test("a wildcard export resolves a deep subpath to its built file", () => {
    expect(resolveExportTargets({ "./*": { types: "./dist/*.d.ts", default: "./dist/*.js" } }, "./agents/system")).toEqual([
      "dist/agents/system.d.ts",
      "dist/agents/system.js",
    ]);
  });

  test("an exact export wins over the wildcard", () => {
    expect(resolveExportTargets({ "./world": "./dist/world.js", "./*": "./dist/*.js" }, "./world")).toEqual(["dist/world.js"]);
  });

  test("a subpath the map does not cover resolves to nothing", () => {
    expect(resolveExportTargets({ ".": "./dist/index.js" }, "./agents/system")).toEqual([]);
  });
});

test("resolution errors name the package a missing dependency belongs to", () => {
  expect(unresolvableDependency("Cannot find package 'react/jsx-runtime' imported from x")).toBe("react");
  expect(unresolvableDependency("Unexpected while resolving package '@scope/pkg/sub' from 'y'")).toBe("@scope/pkg");
  expect(unresolvableDependency("SyntaxError: Unexpected token")).toBeNull();
});
