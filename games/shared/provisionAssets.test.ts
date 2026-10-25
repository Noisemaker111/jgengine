import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { missingPulls } from "./provisionAssets";

const catalogs = {
  sources: [{ id: "kaykit-city" }, { id: "ambient-rock", kind: "material" }, { id: "unused-pack" }],
  library: [
    { name: "city/street-lamp", origin: { provider: "quaternius" } },
    { name: "city/generated-thing", origin: { provider: "generated" } },
  ],
};

mkdirSync(join(import.meta.dir, "../../.scratch"), { recursive: true });

describe("dev provisions what a game references", () => {
  test("pulls referenced packs and library models that are not on disk, and nothing else", () => {
    const publicDir = mkdtempSync(join(import.meta.dir, "../../.scratch/jg-provision-"));
    try {
      const text = `model("kaykit-city"); material('ambient-rock'); lamp("city/street-lamp"); gen("city/generated-thing")`;
      expect(missingPulls(text, publicDir, catalogs).map((job) => job.target)).toEqual(["kaykit-city", "ambient-rock", "model:city/street-lamp"]);
      mkdirSync(join(publicDir, "models", "kaykit-city"), { recursive: true });
      writeFileSync(join(publicDir, "models", "kaykit-city", "a.glb"), "x");
      expect(missingPulls(text, publicDir, catalogs).map((job) => job.target)).toEqual(["ambient-rock", "model:city/street-lamp"]);
    } finally {
      rmSync(publicDir, { recursive: true, force: true });
    }
  });
});
