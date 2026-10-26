import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { inCi, missingServed } from "./assetTest";

test("CI is detected from the CI variable; a missing model names its file and the fix", () => {
  expect(inCi({ CI: "true" })).toBe(true);
  expect(inCi({})).toBe(false);
  expect(inCi({ CI: "false" })).toBe(false);
  const root = resolve(import.meta.dir, "..", "..", ".scratch", `asset-test-${process.pid}`);
  try {
    mkdirSync(join(root, "models", "pack"), { recursive: true });
    writeFileSync(join(root, "models", "pack", "a.glb"), "");
    expect(missingServed(root, ["/models/pack/a.glb", "/models/pack/b.glb"])).toEqual([
      "/models/pack/b.glb is not on disk; run: bun run games:provision",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
