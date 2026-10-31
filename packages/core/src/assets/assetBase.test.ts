import { afterEach, describe, expect, test } from "bun:test";

import { resolveAssetBaseUrl, setAssetBase, setGameAssetFiles } from "./assetBase";

afterEach(() => {
  setAssetBase("/");
  setGameAssetFiles(null);
});

describe("resolveAssetBaseUrl", () => {
  test("passes everything through under the default root base", () => {
    expect(resolveAssetBaseUrl("/models/ship.glb")).toBe("/models/ship.glb");
    expect(resolveAssetBaseUrl("textures/a.png")).toBe("textures/a.png");
  });

  test("rebases root-absolute urls under the installed base", () => {
    setAssetBase("/play/");
    expect(resolveAssetBaseUrl("/models/ship.glb")).toBe("/play/models/ship.glb");
    expect(resolveAssetBaseUrl("/materials/grass/color.jpg")).toBe("/play/materials/grass/color.jpg");
  });

  test("leaves relative, scheme, protocol-relative, and already-based urls alone", () => {
    setAssetBase("/play/");
    expect(resolveAssetBaseUrl("models/ship.glb")).toBe("models/ship.glb");
    expect(resolveAssetBaseUrl("https://cdn.example/ship.glb")).toBe("https://cdn.example/ship.glb");
    expect(resolveAssetBaseUrl("blob:https://x/1")).toBe("blob:https://x/1");
    expect(resolveAssetBaseUrl("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(resolveAssetBaseUrl("//cdn.example/ship.glb")).toBe("//cdn.example/ship.glb");
    expect(resolveAssetBaseUrl("/play/models/ship.glb")).toBe("/play/models/ship.glb");
  });

  test("does not mistake a sibling path prefix for the base", () => {
    setAssetBase("/play/");
    expect(resolveAssetBaseUrl("/playground/x.glb")).toBe("/play/playground/x.glb");
  });

  test("normalizes a base missing its trailing slash", () => {
    setAssetBase("/play");
    expect(resolveAssetBaseUrl("/models/ship.glb")).toBe("/play/models/ship.glb");
  });

  test("treats non-root bases as pass-through", () => {
    setAssetBase("./");
    expect(resolveAssetBaseUrl("/models/ship.glb")).toBe("/models/ship.glb");
  });

  test("loads the running game's own files from its folder and everything else from the shared base", () => {
    setAssetBase("/play/");
    setGameAssetFiles("games/deepward", ["/models/imported/nature/Bush.glb"]);
    expect(resolveAssetBaseUrl("/models/imported/nature/Bush.glb")).toBe("/play/games/deepward/models/imported/nature/Bush.glb");
    expect(resolveAssetBaseUrl("/models/imported/nature/Bush.glb?v=2")).toBe("/play/games/deepward/models/imported/nature/Bush.glb?v=2");
    expect(resolveAssetBaseUrl("/models/kaykit-dungeon/wall.glb")).toBe("/play/models/kaykit-dungeon/wall.glb");
  });

  test("moves a game file the loader already based (a .gltf's own texture) into the game's folder, once", () => {
    setAssetBase("/play/");
    setGameAssetFiles("games/ember-command", ["/models/scenery/T_Wood.png"]);
    expect(resolveAssetBaseUrl("/play/models/scenery/T_Wood.png")).toBe("/play/games/ember-command/models/scenery/T_Wood.png");
    expect(resolveAssetBaseUrl("/play/games/ember-command/models/scenery/T_Wood.png")).toBe("/play/games/ember-command/models/scenery/T_Wood.png");
    expect(resolveAssetBaseUrl("/play/models/shared.png")).toBe("/play/models/shared.png");
  });

  test("finds a model's texture named through its own folder (`settlements/../scenery/a.png`)", () => {
    setAssetBase("/play/");
    setGameAssetFiles("games/ember-command", ["/models/scenery/T_Wood.png"]);
    expect(resolveAssetBaseUrl("/models/settlements/../scenery/T_Wood.png")).toBe("/play/games/ember-command/models/scenery/T_Wood.png");
    expect(resolveAssetBaseUrl("/models/settlements/./../scenery/T_Wood.png?v=1")).toBe("/play/games/ember-command/models/scenery/T_Wood.png?v=1");
  });

  test("scopes game files under the root base too", () => {
    setGameAssetFiles("games/fernwild/", ["/models/a.glb"]);
    expect(resolveAssetBaseUrl("/models/a.glb")).toBe("/games/fernwild/models/a.glb");
    expect(resolveAssetBaseUrl("/models/b.glb")).toBe("/models/b.glb");
  });
});
