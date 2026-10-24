import { describe, expect, test } from "bun:test";

import {
  absenceOnly,
  awaitPublished,
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

describe("a fresh publish reaches the registry minutes later", () => {
  test("only an absent package is worth waiting for", () => {
    expect(absenceOnly(["@jgengine/core@0.37.0: 0.37.0 is not published (npm has 0.36.0)"])).toBe(true);
    expect(absenceOnly(["@jgengine/shell@0.37.0: tarball https://x returned 404 - metadata without a tarball counts as unpublished"])).toBe(true);
    expect(absenceOnly(["@jgengine/ws@0.37.0: the registry has no metadata for @jgengine/ws"])).toBe(true);
    expect(absenceOnly(["@jgengine/core@0.37.0: ./agents/system resolves to ./dist/agents/system.js, which the tarball does not contain"])).toBe(false);
    expect(absenceOnly(["@jgengine/core@0.37.0: the tarball's package.json says 0.36.0, so installing 0.37.0 would report the wrong version"])).toBe(false);
    expect(absenceOnly([])).toBe(false);
  });

  test("an absent package is re-checked until it appears, then the cleaned-up failures are reported", async () => {
    let clock = 0;
    const sleeps: number[] = [];
    let checks = 0;
    const waited = await awaitPublished({
      waitSeconds: 60,
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
      check: async () => {
        checks += 1;
        return checks < 3 ? ["@jgengine/core@0.37.0: 0.37.0 is not published"] : [];
      },
    });
    expect(waited).toEqual({ failures: [], attempts: 3, waitedMs: 20_000 });
    expect(sleeps).toEqual([10_000, 10_000]);
  });

  test("a real packaging defect fails on the first check instead of waiting", async () => {
    let checks = 0;
    const waited = await awaitPublished({
      waitSeconds: 300,
      now: () => 0,
      sleep: async () => {
        throw new Error("should not wait");
      },
      check: async () => {
        checks += 1;
        return ["@jgengine/core@0.37.0: main entry ./dist/index.js failed to import: SyntaxError"];
      },
    });
    expect(checks).toBe(1);
    expect(waited.attempts).toBe(1);
    expect(waited.failures).toHaveLength(1);
  });

  test("a zero budget checks once and never sleeps", async () => {
    const waited = await awaitPublished({
      waitSeconds: 0,
      sleep: async () => {
        throw new Error("should not wait");
      },
      check: async () => ["@jgengine/core@0.37.0: 0.37.0 is not published"],
    });
    expect(waited.attempts).toBe(1);
    expect(waited.failures).toHaveLength(1);
  });
});

