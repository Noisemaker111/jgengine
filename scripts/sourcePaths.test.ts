import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findDrift, rewritePaths, sourcePathEntries, syncSourcePaths } from "./sourcePaths";

describe("the real repository", () => {
  test("every workspace tsconfig resolves @jgengine/* to source and builds stay on dist", () => {
    expect(findDrift()).toEqual([]);
  });
});

describe("source path map", () => {
  let root: string;
  const write = (rel: string, body: unknown): void => {
    const full = join(root, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, typeof body === "string" ? body : `${JSON.stringify(body, null, 2)}\n`);
  };
  const pkg = (dir: string, name: string, index = true): void => {
    write(`packages/${dir}/package.json`, { name });
    write(`packages/${dir}/src/${index ? "index.ts" : "a.ts"}`, "export {};\n");
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "source-paths-"));
    pkg("core", "@jgengine/core");
    pkg("shell", "@jgengine/shell", false);
    pkg("jgengine", "jgengine");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("maps each scoped package's index and subpaths relative to the config", () => {
    expect(sourcePathEntries(join(root, "apps", "dev"), root)).toEqual({
      "@jgengine/core": ["../../packages/core/src/index.ts"],
      "@jgengine/core/*": ["../../packages/core/src/*"],
      "@jgengine/shell/*": ["../../packages/shell/src/*"],
    });
  });

  test("a config with its own paths that drops a package is drift, and sync repairs it keeping local aliases", () => {
    write("tsconfig.base.json", { compilerOptions: { paths: sourcePathEntries(root, root) } });
    syncSourcePaths(root);
    write("apps/dev/package.json", { name: "dev" });
    write("apps/dev/tsconfig.json", {
      extends: "../../tsconfig.base.json",
      compilerOptions: { paths: { "@/ui/*": ["./ui/*"], "@jgengine/core/*": ["../../packages/core/src/*"] } },
    });
    expect(findDrift(root).map((d) => d.file)).toEqual(["apps/dev/tsconfig.json"]);

    expect(syncSourcePaths(root)).toEqual(["apps/dev/tsconfig.json"]);
    const paths = JSON.parse(readFileSync(join(root, "apps/dev/tsconfig.json"), "utf8")).compilerOptions.paths;
    expect(Object.keys(paths)).toEqual(["@/ui/*", "@jgengine/core", "@jgengine/core/*", "@jgengine/shell/*"]);
    expect(findDrift(root)).toEqual([]);
  });

  test("a config that neither extends the base nor declares paths falls back to dist", () => {
    write("tsconfig.base.json", { compilerOptions: { paths: sourcePathEntries(root, root) } });
    write("packages/core/tsconfig.json", { compilerOptions: { strict: true } });
    expect(findDrift(root)).toEqual([
      { file: "packages/core/tsconfig.json", reason: "no `paths` in effect — extend tsconfig.base.json" },
    ]);
  });

  test("a build config must not inherit or map sibling source", () => {
    write("tsconfig.base.json", { compilerOptions: { paths: sourcePathEntries(root, root) } });
    write("packages/shell/tsconfig.json", { extends: "../../tsconfig.base.json" });
    write("packages/shell/tsconfig.build.json", { extends: "./tsconfig.json", compilerOptions: { outDir: "dist" } });
    expect(findDrift(root).map((d) => d.file)).toEqual(["packages/shell/tsconfig.build.json"]);

    write("packages/shell/tsconfig.build.json", {
      extends: "./tsconfig.json",
      compilerOptions: { paths: { "@jgengine/shell/*": ["./src/*"], "@jgengine/core/*": ["../core/src/*"] } },
    });
    expect(findDrift(root)[0]?.reason).toContain("@jgengine/core/*");

    write("packages/shell/tsconfig.build.json", {
      extends: "./tsconfig.json",
      compilerOptions: { paths: { "@jgengine/shell/*": ["./src/*"] } },
    });
    expect(findDrift(root)).toEqual([]);
  });

  test("rewritePaths keeps the surrounding formatting", () => {
    const text = '{\n  "compilerOptions": {\n    "strict": true,\n    "paths": { "@jgengine/core/*": ["x"] }\n  },\n  "include": ["src"]\n}\n';
    const next = rewritePaths(text, root, root);
    expect(next.startsWith('{\n  "compilerOptions": {\n    "strict": true,\n    "paths": {\n      "@jgengine/core": ["./packages/core/src/index.ts"],')).toBe(true);
    expect(next.endsWith('    }\n  },\n  "include": ["src"]\n}\n')).toBe(true);
  });
});
