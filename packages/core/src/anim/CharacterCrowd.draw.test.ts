import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import type { ModelConfig } from "@jgengine/core/game/playableGame";
import type { MaterialAsset } from "@jgengine/core/material/materialAsset";

import { crowdSlotSource } from "./CharacterCrowd.draw";
import { crowdEligible } from "./crowdRegistry.draw";
import { bakeSkinnedCrowd } from "./SkinnedInstances.draw";

/** A two-slot body like a Quaternius guest: one shirt, one skin, each its own material and part. */
function body(): { scene: THREE.Group; shirt: THREE.MeshStandardMaterial; skin: THREE.MeshStandardMaterial } {
  const shirt = new THREE.MeshStandardMaterial({ color: "#ffffff" });
  shirt.name = "Shirt";
  const skin = new THREE.MeshStandardMaterial({ color: "#ffffff" });
  skin.name = "Skin";
  const scene = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), shirt);
  torso.name = "Torso";
  torso.position.y = 1.1;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), skin);
  head.name = "Head";
  head.position.y = 1.65;
  scene.add(torso, head);
  return { scene, shirt, skin };
}

const paint = (id: string, color: string): MaterialAsset => ({
  schemaVersion: 1,
  id,
  name: id,
  family: "standard",
  capabilities: ["pbr"],
  surface: { color, roughness: 0.85, metalness: 0 },
});

/** The park's palette-shirt guest: per-slot assignments and no whole-model override. */
const guest: ModelConfig = {
  url: "guest.glb",
  materialAssets: [paint("guest.Shirt", "#ef7059"), paint("guest.Skin", "#f1c9a0")],
  materialAssignments: [
    { materialId: "guest.Shirt", selector: { slot: "Shirt" } },
    { materialId: "guest.Skin", selector: { slot: "Skin" } },
  ],
};

describe("crowdSlotSource", () => {
  test("the crowd bake draws a guest in the palette its own rig paints, one draw per slot", () => {
    expect(crowdEligible(guest)).toBe(true);
    const { scene, shirt, skin } = body();
    const assigned = crowdSlotSource(scene, guest);
    const baked = bakeSkinnedCrowd({ scene: assigned.scene, animations: [] });
    const colors = baked.materials.map((material) => `#${(material as THREE.MeshStandardMaterial).color.getHexString()}`).sort();
    expect(colors).toEqual(["#ef7059", "#f1c9a0"]);
    expect(baked.geometry.groups).toHaveLength(2);
    // The loaded rig other entities clone from keeps its own materials.
    expect(shirt.color.getHexString()).toBe("ffffff");
    expect(skin.color.getHexString()).toBe("ffffff");
    expect((scene.children[0] as THREE.Mesh).material).toBe(shirt);
    expect(assigned.materials).toHaveLength(2);
    for (const material of assigned.materials) material.dispose();
    baked.dispose();
  });

  test("an assignment naming a slot the rig lacks throws, so the kind stays on its own rig", () => {
    const { scene } = body();
    const missing: ModelConfig = { ...guest, materialAssignments: [{ materialId: "guest.Shirt", selector: { slot: "Vest" } }] };
    expect(() => crowdSlotSource(scene, missing)).toThrow();
  });
});
