import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { installAssetBase } from "./assetBase.draw";

describe("installAssetBase", () => {
  test("registers the resolver on the default loading manager", () => {
    installAssetBase("/play/");
    expect(THREE.DefaultLoadingManager.resolveURL("/models/ship.glb")).toBe("/play/models/ship.glb");
    installAssetBase("/");
  });
});
