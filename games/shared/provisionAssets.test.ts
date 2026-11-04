import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { gameAssetText, missingPulls, shouldProvision, drawsPavedRoad } from "./provisionAssets";

const catalogs = {
  sources: [{ id: "kaykit-city" }, { id: "ambient-rock", kind: "material" }, { id: "unused-pack" }],
  library: [
    { name: "city/street-lamp", origin: { provider: "quaternius" } },
    { name: "city/generated-thing", origin: { provider: "generated" } },
  ],
};

mkdirSync(join(import.meta.dir, "../../.scratch"), { recursive: true });

describe("dev provisions what a game references", () => {
  test("pulls named pack imports, including aliases, without a quoted source id", () => {
    const publicDir = mkdtempSync(join(import.meta.dir, "../../.scratch/jg-provision-"));
    try {
      const text = `import { kaykitCity as buildings, ambientRock } from "@jgengine/assets/generated/packs";`;
      expect(missingPulls(text, publicDir, catalogs).map((job) => job.target)).toEqual(["kaykit-city", "ambient-rock"]);
      expect(missingPulls(`import { kaykitCity } from "somewhere-else";`, publicDir, catalogs)).toEqual([]);
    } finally {
      rmSync(publicDir, { recursive: true, force: true });
    }
  });

  test("pulls quoted shared-library keys once per served folder", () => {
    const publicDir = mkdtempSync(join(import.meta.dir, "../../.scratch/jg-provision-"));
    try {
      const libraryPull = (key: string) =>
        key.startsWith("gameicons:") ? { target: "gameicons-icons", dir: join("sprites", "gameicons-icons") } : key === "makehuman:old-man" ? { target: key, dir: join("models", "library", "makehuman", "old-man") } : key === "polyhaven:chair" ? { target: key, dir: join("models", "library", "polyhaven", "chair") } : undefined;
      const text = `icon: "gameicons:lorc/wheat", other: 'gameicons:delapouite/beet', model("polyhaven:chair"), person("makehuman:old-man"), unknown("polyhaven:nope")`;
      expect(missingPulls(text, publicDir, { ...catalogs, libraryPull }).map((job) => job.target)).toEqual(["gameicons-icons", "polyhaven:chair", "makehuman:old-man"]);
    } finally {
      rmSync(publicDir, { recursive: true, force: true });
    }
  });

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

describe("the editor scene names assets too", () => {
  test("a surface only the scene names is provisioned", () => {
    // 0.51.0's site deploy: Brightway Park and Ember Command named their ground in editor.scene.json only.
    const gameDir = mkdtempSync(join(import.meta.dir, "../../.scratch/jg-provision-game-"));
    try {
      mkdirSync(join(gameDir, "src"), { recursive: true });
      writeFileSync(join(gameDir, "src", "world.ts"), `export const sky = "clear";`);
      writeFileSync(join(gameDir, "src", "editor.scene.json"), JSON.stringify({ ground: { material: "ground/dirt" } }));
      const withMaterials = { ...catalogs, materials: [{ name: "ground/dirt", source: "ambient-rock" }] };
      expect(missingPulls(gameAssetText(gameDir), join(gameDir, "public"), withMaterials).map((job) => job.target)).toEqual(["ambient-rock"]);
    } finally {
      rmSync(gameDir, { recursive: true, force: true });
    }
  });
});

describe("an alias pulls the pack it resolves into", () => {
  test("asset:prop_crate in a game's source provisions the pack behind it", () => {
    const publicDir = mkdtempSync(join(import.meta.dir, "../../.scratch/jg-provision-"));
    try {
      const withAliases = { ...catalogs, sources: [...catalogs.sources, { id: "kaykit-dungeon" }], aliases: [{ key: "asset:prop_crate", target: "kaykit-dungeon/crate" }] };
      expect(missingPulls(`crate: { model: "asset:prop_crate" }`, publicDir, withAliases).map((job) => job.target)).toEqual(["kaykit-dungeon"]);
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
