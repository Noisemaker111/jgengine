import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { installAssetBase, resolveAssetBaseUrl } from "./assetBase";

describe("resolveAssetBaseUrl", () => {
  test("passes everything through under the default root base", () => {
    installAssetBase("/");
    expect(resolveAssetBaseUrl("/models/ship.glb")).toBe("/models/ship.glb");
    expect(resolveAssetBaseUrl("textures/a.png")).toBe("textures/a.png");
  });

  test("rebases root-absolute urls under the installed base", () => {
    installAssetBase("/play/");
    expect(resolveAssetBaseUrl("/models/ship.glb")).toBe("/play/models/ship.glb");
    expect(resolveAssetBaseUrl("/materials/grass/color.jpg")).toBe("/play/materials/grass/color.jpg");
  });

  test("leaves relative, scheme, protocol-relative, and already-based urls alone", () => {
    installAssetBase("/play/");
    expect(resolveAssetBaseUrl("models/ship.glb")).toBe("models/ship.glb");
    expect(resolveAssetBaseUrl("https://cdn.example/ship.glb")).toBe("https://cdn.example/ship.glb");
    expect(resolveAssetBaseUrl("blob:https://x/1")).toBe("blob:https://x/1");
    expect(resolveAssetBaseUrl("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(resolveAssetBaseUrl("//cdn.example/ship.glb")).toBe("//cdn.example/ship.glb");
    expect(resolveAssetBaseUrl("/play/models/ship.glb")).toBe("/play/models/ship.glb");
  });

  test("does not mistake a sibling path prefix for the base", () => {
    installAssetBase("/play/");
    expect(resolveAssetBaseUrl("/playground/x.glb")).toBe("/play/playground/x.glb");
  });

  test("normalizes a base missing its trailing slash", () => {
    installAssetBase("/play");
    expect(resolveAssetBaseUrl("/models/ship.glb")).toBe("/play/models/ship.glb");
  });

  test("treats non-root bases as pass-through", () => {
    installAssetBase("./");
    expect(resolveAssetBaseUrl("/models/ship.glb")).toBe("/models/ship.glb");
  });

  test("registers itself on the default loading manager", () => {
    installAssetBase("/play/");
    expect(THREE.DefaultLoadingManager.resolveURL("/models/ship.glb")).toBe("/play/models/ship.glb");
    installAssetBase("/");
  });
});
