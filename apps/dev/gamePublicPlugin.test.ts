import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { contentKey, imageVariantName } from "../../games/shared/textureVariants";
import { gamePrefetchList, gamePublicDirs, gamePublicIndexModule, listPublicFiles, resolvePublicFile, splitGamePublicUrl, writeGamePublics } from "./gamePublicPlugin";

function fixture() {
  // fixture-location: allow plain bytes on disk; the plugin imports nothing from @jgengine
  const root = mkdtempSync(join(tmpdir(), "game-public-"));
  const games = join(root, "games");
  const served = join(root, "lane", "harbor");
  const bush = join("models", "imported", "nature");
  for (const dir of [join(games, "harbor", "src"), join(games, "harbor", "public", bush), join(games, "fernwild", "src"), join(games, "fernwild", "public", bush), join(games, "notes", "public"), join(served, "public", bush)]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(games, "harbor", "src", "index.tsx"), "");
  writeFileSync(join(games, "fernwild", "src", "index.tsx"), "");
  writeFileSync(join(games, "harbor", "public", bush, "Bush.glb"), "harbor");
  writeFileSync(join(games, "fernwild", "public", bush, "Bush.glb"), "fernwild");
  writeFileSync(join(served, "public", bush, "Bush.glb"), "served");
  writeFileSync(join(root, "secret.txt"), "no");
  return { root, games, served };
}

describe("each game's own files reach the runner", () => {
  test("every loadable game has its public folder, and the --game-dir game replaces its in-repo copy", () => {
    const { games, served } = fixture();
    expect([...gamePublicDirs(undefined, games)]).toEqual([["fernwild", join(games, "fernwild", "public")], ["harbor", join(games, "harbor", "public")]]);
    expect(gamePublicDirs(served, games).get("harbor")).toBe(join(served, "public"));
  });

  test("a game's files are listed as the paths it asks for", () => {
    const { games } = fixture();
    expect(listPublicFiles(join(games, "harbor", "public"))).toEqual(["/models/imported/nature/Bush.glb"]);
  });

  test("two games keep their own copy of the same path in a production build", () => {
    const { root, games } = fixture();
    const out = join(root, "dist");
    expect(writeGamePublics(out, gamePublicDirs(undefined, games))).toBe(2);
    expect(readFileSync(join(out, "games", "harbor", "models", "imported", "nature", "Bush.glb"), "utf8")).toBe("harbor");
    expect(readFileSync(join(out, "games", "fernwild", "models", "imported", "nature", "Bush.glb"), "utf8")).toBe("fernwild");
    expect(existsSync(join(out, "games", "notes"))).toBe(false);
  });

  test("the runner module names one lazy list per game", () => {
    const code = gamePublicIndexModule(["fernwild", "harbor"]);
    expect(code).toContain(`"harbor": () => import("virtual:jgengine-game-public/harbor")`);
  });

  test("a game fetches only what it names, near versions first, with a .gltf's own files", () => {
    const { root } = fixture();
    const lamp = join(root, "near.gltf");
    writeFileSync(lamp, JSON.stringify({ buffers: [{ uri: "lamp.bin" }], images: [{ uri: "data:image/png;base64,AA" }, { uri: "lamp.png" }] }));
    const files = [
      "/models/imported/nature/Bush.glb",
      "/models/imported/nature/Pine.glb",
      "/models/library/city/street-lamp/far.gltf",
      "/models/library/city/street-lamp/near.gltf",
      "/models/library/city/street-lamp/lamp.bin",
      "/models/library/city/street-lamp/lamp.png",
      "/materials/ambientcg-rock/color.jpg",
    ];
    const text = `{ model: "/models/imported/nature/Bush.glb", lamp: "city/street-lamp", ground: "ambientcg-rock", gone: "/models/none.glb" }`;
    const list = gamePrefetchList(text, files, new Set(["/models/shared/wall.glb"]), (path) => (path.endsWith("near.gltf") ? lamp : null));
    expect(list.map((item) => `${item.tier} ${item.path}`).sort()).toEqual([
      "far /models/library/city/street-lamp/far.gltf",
      "near /materials/ambientcg-rock/color.jpg",
      "near /models/imported/nature/Bush.glb",
      "near /models/library/city/street-lamp/lamp.bin",
      "near /models/library/city/street-lamp/lamp.png",
      "near /models/library/city/street-lamp/near.gltf",
    ]);
  });

  test("a dev request under games/<id>/ resolves inside that game's folder only", () => {
    const { root, games } = fixture();
    const split = splitGamePublicUrl("/games/fernwild/models/imported/nature/Bush.glb?v=1");
    expect(split).toEqual({ game: "fernwild", path: "/models/imported/nature/Bush.glb?v=1" });
    expect(resolvePublicFile(split?.path ?? "", join(games, "fernwild", "public"))).toBe(join(games, "fernwild", "public", "models", "imported", "nature", "Bush.glb"));
    expect(resolvePublicFile("/models/missing.glb", join(games, "fernwild", "public"))).toBeNull();
    expect(resolvePublicFile("/../secret.txt", join(games, "fernwild", "public"))).toBeNull();
    expect(resolvePublicFile("/models/%2e%2e/%2e%2e/%2e%2e/%2e%2e/secret.txt", join(games, "fernwild", "public"))).toBeNull();
    expect(splitGamePublicUrl("/models/a.glb")).toBeNull();
    expect(root).not.toBe("");
  });

  test("an image asked for as KTX2 resolves to its twin once one is encoded", () => {
    const { root, games } = fixture();
    const pub = join(games, "harbor", "public");
    const variants = join(root, ".ktx2");
    mkdirSync(variants);
    writeFileSync(join(pub, "color.png"), "png");
    const original = join(pub, "color.png");
    expect(resolvePublicFile("/color.png?ktx2=color,top", pub, variants)).toBe(original);
    const twin = join(variants, imageVariantName(contentKey(new TextEncoder().encode("png")), { role: "color", orient: "top" }));
    writeFileSync(twin, "ktx2");
    expect(resolvePublicFile("/color.png?ktx2=color,top", pub, variants)).toBe(twin);
    expect(resolvePublicFile("/color.png", pub, variants)).toBe(original);
  });
});
