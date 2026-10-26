import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { missingPulls, shouldProvision, drawsPavedRoad } from "./provisionAssets";

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

describe("an alias pulls the pack it resolves into", () => {
  test("asset:person_casual in a game's source provisions the character pack behind it", () => {
    const publicDir = mkdtempSync(join(import.meta.dir, "../../.scratch/jg-provision-"));
    try {
      const withAliases = { ...catalogs, sources: [...catalogs.sources, { id: "kaykit-adventurers" }], aliases: [{ key: "asset:person_casual", target: "kaykit-adventurers/Rogue" }] };
      expect(missingPulls(`player: { model: "asset:person_casual" }`, publicDir, withAliases).map((job) => job.target)).toEqual(["kaykit-adventurers"]);
      expect(missingPulls(`player: { model: "asset:other" }`, publicDir, withAliases)).toEqual([]);
    } finally {
      rmSync(publicDir, { recursive: true, force: true });
    }
  });
});

describe("when dev provisions", () => {
  test("on by default, off in CI, and the override wins either way", () => {
    expect(shouldProvision({})).toBe(true);
    expect(shouldProvision({ CI: "true" })).toBe(false);
    expect(shouldProvision({ CI: "true", JG_DEV_PROVISION: "1" })).toBe(true);
    expect(shouldProvision({ JG_DEV_PROVISION: "0" })).toBe(false);
  });
});

test("a game that draws a paved road needs the default asphalt scan", () => {
  expect(drawsPavedRoad("roads: [road({ path, width: 8 })]", "")).toBe(true);
  expect(drawsPavedRoad("", '{ "kind": "track", "points": [] }')).toBe(true);
  expect(drawsPavedRoad("const broad = 1;", '{ "kind": "trail" }')).toBe(false);
});
