import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assetLiterals } from "../apps/dev/gamePublicPlugin";
import { bundleBudgetReport, gameBundles, missingGameAssets } from "./check-site-assets";

const catalogs = { sources: [{ id: "kaykit-dungeon" }], library: [{ name: "city/street-lamp", origin: { provider: "quaternius" } }] };

function playDir(): string {
  // fixture-location: allow plain bytes on disk standing in for a built runner
  const root = mkdtempSync(join(tmpdir(), "site-assets-"));
  for (const dir of [join(root, "games", "harbor", "models", "imported", "nature"), join(root, "models", "kaykit-dungeon"), join(root, "games", "harbor", "models", "library", "city", "street-lamp")]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(root, "games", "harbor", "models", "imported", "nature", "Bush.glb"), "x");
  writeFileSync(join(root, "models", "kaykit-dungeon", "wall.glb"), "x");
  writeFileSync(join(root, "games", "harbor", "models", "library", "city", "street-lamp", "near.gltf"), "x");
  return root;
}

describe("the site asset gate", () => {
  test("reads root-absolute asset paths written as strings", () => {
    expect(assetLiterals(`model: "/models/imported/nature/Bush.glb", icon: '/ui/a.png', rel: "models/x.glb", page: "/play/"`)).toEqual(["/models/imported/nature/Bush.glb", "/ui/a.png"]);
  });

  test("passes when every named file and pack is in the game's folder or the shared one", () => {
    const text = `"/models/imported/nature/Bush.glb" "kaykit-dungeon" "city/street-lamp"`;
    expect(missingGameAssets("harbor", text, playDir(), catalogs)).toEqual([]);
  });

  test("fails on a file, pack or library model the build lacks", () => {
    const text = `"/models/imported/nature/Pine.glb" "city/street-lamp"`;
    expect(missingGameAssets("fernwild", text, playDir(), catalogs)).toEqual(["/models/imported/nature/Pine.glb", "models/library/city/street-lamp/ (model:city/street-lamp)"]);
  });

  test("fails on a texture a model loads beside itself that the build lacks", () => {
    const root = playDir();
    const json = Buffer.from(JSON.stringify({ images: [{ uri: "../scenery/T_Wood.png" }, { uri: "../scenery/T_Stone.png" }] }));
    const header = Buffer.alloc(20);
    header.write("glTF", 0, "latin1");
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(20 + json.length, 8);
    header.writeUInt32LE(json.length, 12);
    header.write("JSON", 16, "latin1");
    mkdirSync(join(root, "games", "harbor", "models", "town", "settlements"), { recursive: true });
    mkdirSync(join(root, "games", "harbor", "models", "town", "scenery"), { recursive: true });
    writeFileSync(join(root, "games", "harbor", "models", "town", "settlements", "inn.glb"), Buffer.concat([header, json]));
    writeFileSync(join(root, "games", "harbor", "models", "town", "scenery", "T_Wood.png"), "x");
    expect(missingGameAssets("harbor", `"/models/town/settlements/inn.glb"`, root, catalogs)).toEqual(["/models/town/scenery/T_Stone.png"]);
  });
});

describe("the per-game bundle budget", () => {
  function runner(): string {
    // fixture-location: allow plain bytes on disk standing in for a built runner
    const root = mkdtempSync(join(tmpdir(), "bundle-budget-"));
    mkdirSync(join(root, "assets"), { recursive: true });
    const put = (name: string, bytes: number) => writeFileSync(join(root, "assets", name), "x".repeat(bytes));
    put("shell.js", 1000);
    put("engine.js", 2048);
    put("a-own.js", 1024);
    put("b-own.js", 512);
    put("a.css", 100);
    put("entry-a.js", 10);
    put("entry-b.js", 20);
    writeFileSync(join(root, "index.html"), '<script src="/play/assets/shell.js"></script>');
    const files = ["assets/shell.js", "assets/engine.js", "assets/a-own.js", "assets/b-own.js", "assets/a.css"];
    writeFileSync(
      join(root, "assets", "registries-X.js"),
      `m.f=${JSON.stringify(files)}` +
        '"../../../games/alpha/src/index.tsx":()=>a(()=>import(`./entry-a.js`),__vite__mapDeps([0,1,2,4])),' +
        '"../../../games/beta/src/index.tsx":()=>a(()=>import(`./entry-b.js`),__vite__mapDeps([0,1,3]))',
    );
    return root;
  }

  test("counts a game's preloaded JS and CSS past the shell, and what only it loads", () => {
    const bundles = gameBundles(runner());
    expect(bundles.get("alpha")).toEqual({ bytes: 10 + 2048 + 1024 + 100, ownBytes: 10 + 1024 + 100, files: 4 });
    expect(bundles.get("beta")).toEqual({ bytes: 20 + 2048 + 512, ownBytes: 20 + 512, files: 3 });
  });

  test("fails a game over its budget or without one, and prints a row per game", () => {
    const bundles = gameBundles(runner());
    const report = bundleBudgetReport(bundles, (game) => (game === "alpha" ? 3 : undefined));
    expect(report.failures).toEqual([
      "alpha: bundle 3.1 KiB is over its 3 KiB budget",
      "beta: no bundleKb budget (add it to its perf-budget.json; today it is 2.5 KiB)",
    ]);
    expect(report.table.split("\n")).toHaveLength(3);
    expect(bundleBudgetReport(bundles, () => 4).failures).toEqual([]);
  });
});
