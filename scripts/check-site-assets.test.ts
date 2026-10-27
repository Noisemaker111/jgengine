import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assetLiterals } from "../apps/dev/gamePublicPlugin";
import { missingGameAssets } from "./check-site-assets";

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
