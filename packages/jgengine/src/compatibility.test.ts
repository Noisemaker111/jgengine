import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installedSdkVersions, versionNewer } from "./compatibility";

test("downgrades account for release candidates, numeric prereleases, and build metadata", () => {
  expect(versionNewer("0.16.0", "0.16.0-next.2")).toBe(true);
  expect(versionNewer("0.16.0-next.10", "0.16.0-next.2")).toBe(true);
  expect(versionNewer("0.16.0-next.2", "0.16.0")).toBe(false);
  expect(versionNewer("0.16.0+build.2", "0.16.0+build.1")).toBe(false);
  expect(() => versionNewer("unknown", "0.16.0")).toThrow();
});

test("installed SDK identities follow hoisted dependencies and ignore the independent github tool", () => {
  const root = mkdtempSync(join(tmpdir(), "jgengine-sdk-identity-"));
  try {
    const project = join(root, "Games", "example");
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, "package.json"), JSON.stringify({ dependencies: {
      "@jgengine/core": "workspace:*", "@jgengine/github": "^1.0.0", "@jgengine/shell": "^0.19.0",
    } }));
    const core = join(root, "node_modules", "@jgengine", "core");
    mkdirSync(core, { recursive: true });
    writeFileSync(join(core, "package.json"), JSON.stringify({ version: "0.20.0" }));
    expect(installedSdkVersions(project)).toEqual([{ name: "@jgengine/core", version: "0.20.0" }]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
