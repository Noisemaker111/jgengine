import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { engineSourcePaths, mergeGamePaths } from "./games-check-paths";

describe("games:check path mapping", () => {
  test("maps package roots and subpaths to src, like the dev runner aliases", () => {
    const root = mkdtempSync(join(tmpdir(), "gcp-"));
    mkdirSync(join(root, "core/src"), { recursive: true });
    writeFileSync(join(root, "core/src/index.ts"), "");
    mkdirSync(join(root, "shell/src"), { recursive: true });
    mkdirSync(join(root, "no-src"), { recursive: true });
    const paths = engineSourcePaths(root);
    expect(paths["@jgengine/core"]).toEqual([join(root, "core/src/index.ts")]);
    expect(paths["@jgengine/core/*"]).toEqual([join(root, "core/src/*")]);
    expect(paths["@jgengine/shell"]).toBeUndefined();
    expect(paths["@jgengine/shell/*"]).toEqual([join(root, "shell/src/*")]);
    expect(Object.keys(paths).some((key) => key.includes("no-src"))).toBe(false);
  });

  test("keeps a game's own aliases and lets engine mappings win for @jgengine/*", () => {
    const merged = mergeGamePaths(
      { "@/components/ui/*": ["/g/registry/*"], "@jgengine/core/*": ["/stale/*"] },
      { "@jgengine/core/*": ["/engine/core/src/*"] },
    );
    expect(merged).toEqual({ "@/components/ui/*": ["/g/registry/*"], "@jgengine/core/*": ["/engine/core/src/*"] });
  });
});
