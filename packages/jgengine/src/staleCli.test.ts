import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { staleCliWarnings } from "./staleCli";

function write(path: string, json: object): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(json));
}

describe("staleCliWarnings", () => {
  test("flags a global CLI run inside a jgengine checkout even when versions match", () => {
    const root = mkdtempSync(join(tmpdir(), "jg-stale-"));
    try {
      write(join(root, "repo", "packages", "jgengine", "package.json"), { name: "jgengine", version: "0.19.0" });
      const warnings = staleCliWarnings(join(root, "repo"), { version: "0.19.0", packageDir: join(root, "global", "jgengine"), sdkVersion: "0.22.0" });
      expect(warnings.join("\n")).toContain("not this checkout's packages/jgengine");
      expect(staleCliWarnings(join(root, "repo"), { version: "0.19.0", packageDir: join(root, "repo", "packages", "jgengine"), sdkVersion: "0.22.0" })).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("flags a CLI built for an older SDK than the game project installs", () => {
    const root = mkdtempSync(join(tmpdir(), "jg-stale-"));
    try {
      write(join(root, "game", "package.json"), { name: "game", dependencies: { "@jgengine/core": "^0.22.0" } });
      write(join(root, "game", "node_modules", "@jgengine", "core", "package.json"), { name: "@jgengine/core", version: "0.22.0" });
      const old = staleCliWarnings(join(root, "game"), { version: "0.19.0", packageDir: join(root, "global"), sdkVersion: "0.19.0" });
      expect(old.join("\n")).toContain("newer than the SDK 0.19.0");
      expect(staleCliWarnings(join(root, "game"), { version: "0.19.0", packageDir: join(root, "global"), sdkVersion: "0.22.0" })).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
