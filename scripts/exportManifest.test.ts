import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  computeExposedSubpaths,
  computeManifest,
  distExists,
  exposedSubpathsForPackageDir,
  formatStaleWarning,
  isForbiddenSubpath,
  missingDistFilesForPackageDir,
  publishedPackages,
  readManifest,
  readPackageJson,
  stalePackages,
  warnIfStaleDist,
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

describe("stale/partial dist detection is build-config aware", () => {
  let pkgDir: string;
  // Mirrors the shape of every package's tsconfig.build.json: include src, emit
  // to dist rooted at src, exclude tests plus a handful of build-excluded files.
  const buildConfig = {
    include: ["src"],
    exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/mcp/cli.ts", "src/recipes/snippets"],
    rootDir: "src",
  };
  const writeSrc = (rel: string): void => {
    const full = join(pkgDir, "src", rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, "export {};\n");
  };
  const writeDist = (rel: string): void => {
    const full = join(pkgDir, "dist", rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, "export {};\n");
  };

  beforeEach(() => {
    pkgDir = mkdtempSync(join(tmpdir(), "export-manifest-stale-"));
    mkdirSync(join(pkgDir, "dist"), { recursive: true });
    mkdirSync(join(pkgDir, "src"), { recursive: true });
  });

  afterEach(() => {
    rmSync(pkgDir, { recursive: true, force: true });
  });

  test("a built src file is not reported missing", () => {
    writeSrc("world.ts");
    writeDist("world.js");
    expect(missingDistFilesForPackageDir(pkgDir, buildConfig)).toEqual([]);
  });

  // The core regression: a fresh src/*.ts with no dist/*.js yet (partial dist)
  // must be named loudly, not silently omitted from the manifest.
  test("an unbuilt src file is reported as missing built output", () => {
    writeSrc("world.ts");
    writeDist("world.js");
    writeSrc("newThing.ts"); // no dist counterpart — the stale case
    expect(missingDistFilesForPackageDir(pkgDir, buildConfig)).toEqual(["newThing.js"]);
  });

  // The false-positive guard the issue calls out: sources the build config
  // excludes (editor mcp/*, jgengine recipes/snippets, tests) legitimately have
  // no dist/*.js and must never be flagged as stale.
  test("build-excluded sources are not false-positives even with no dist", () => {
    writeSrc("world.ts");
    writeDist("world.js");
    writeSrc("mcp/cli.ts"); // excluded specific file
    writeSrc("recipes/snippets/demo.ts"); // excluded directory
    writeSrc("world.test.ts"); // excluded test glob
    expect(missingDistFilesForPackageDir(pkgDir, buildConfig)).toEqual([]);
  });

  test("a .d.ts source is not expected to emit a dist/*.js", () => {
    writeSrc("world.ts");
    writeDist("world.js");
    writeSrc("ambient.d.ts");
    expect(missingDistFilesForPackageDir(pkgDir, buildConfig)).toEqual([]);
  });

  test("formatStaleWarning names each stale package and points at a rebuild", () => {
    const message = formatStaleWarning([{ package: "@jgengine/core", missing: ["foo.js"] }]);
    expect(message).toContain("@jgengine/core");
    expect(message).toContain("foo.js");
    expect(message).toContain("rebuild");
  });
});

describe.if(built)("stale detection on the real built tree", () => {
  test("a fully-built tree has zero stale packages (no false positives)", () => {
    expect(stalePackages()).toEqual([]);
  });

  test("warnIfStaleDist stays silent and advisory on a built tree", () => {
    const logged: string[] = [];
    expect(warnIfStaleDist((message) => logged.push(message))).toBe(false);
    expect(logged).toEqual([]);
  });
});
