import { describe, expect, it } from "bun:test";
import * as THREE from "three";

import { retuneTextureAnisotropy } from "./TextureFiltering";

describe("retuneTextureAnisotropy", () => {
  it("raises default-filtered textures and leaves pinned ones alone", () => {
    const shared = new THREE.Texture();
    const pinned = new THREE.Texture();
    pinned.anisotropy = 4;
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: shared, normalMap: pinned })));
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ roughnessMap: shared })));
    const versionBefore = shared.version;

    const visited = retuneTextureAnisotropy(scene, 1, 16);

    expect(visited).toBe(2);
    expect(shared.anisotropy).toBe(16);
    expect(shared.version).toBe(versionBefore + 1);
    expect(pinned.anisotropy).toBe(4);
  });
});
