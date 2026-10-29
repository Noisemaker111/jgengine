import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { attachWornLayer } from "./wornLayers.draw";

/**
 * A Biped-named body the way an FBX import arrives: Z-up centimetres under a converting root, one
 * skinned mesh whose every bone carries one small triangle of skin, weighted wholly to that bone.
 * Ankles stand at 10 cm, the head bone at 170 cm, so the ankle-to-head span is 1.6 m.
 */
function bipedBody(options: { transparent?: boolean } = {}): { scene: THREE.Group; mesh: THREE.SkinnedMesh; triangleOf: Map<string, number> } {
  const scene = new THREE.Group();
  const avatar = new THREE.Group();
  avatar.rotation.x = -Math.PI / 2;
  avatar.scale.setScalar(0.01);
  scene.add(avatar);
  const bones: THREE.Bone[] = [];
  const bone = (name: string, parent: THREE.Object3D | null, at: readonly [number, number, number]): THREE.Bone => {
    const node = new THREE.Bone();
    node.name = name;
    node.position.set(...at);
    parent?.add(node);
    bones.push(node);
    return node;
  };
  const root = bone("Bip01", null, [0, 0, 0]);
  const pelvis = bone("Bip01_Pelvis", root, [0, 0, 100]);
  const spine = bone("Bip01_Spine", pelvis, [0, 0, 10]);
  const spine1 = bone("Bip01_Spine1", spine, [0, 0, 15]);
  const spine2 = bone("Bip01_Spine2", spine1, [0, 0, 15]);
  const neck = bone("Bip01_Neck", spine2, [0, 0, 20]);
  bone("Bip01_Head", neck, [0, 0, 10]);
  for (const [side, x] of [["L", 1], ["R", -1]] as const) {
    const upper = bone(`Bip01_${side}_UpperArm`, spine2, [x * 20, 0, 15]);
    const fore = bone(`Bip01_${side}_Forearm`, upper, [0, 0, -30]);
    const hand = bone(`Bip01_${side}_Hand`, fore, [0, 0, -25]);
    bone(`Bip01_${side}_Finger0`, hand, [0, 0, -8]);
    const thigh = bone(`Bip01_${side}_Thigh`, pelvis, [x * 10, 0, 0]);
    const calf = bone(`Bip01_${side}_Calf`, thigh, [0, 0, -45]);
    const foot = bone(`Bip01_${side}_Foot`, calf, [0, 0, -45]);
    bone(`Bip01_${side}_Toe0`, foot, [0, -12, -8]);
  }
  avatar.add(root);
  scene.updateMatrixWorld(true);

  // One triangle per bone at the bone, plus a crown 25 cm over the head bone (still weighted to it).
  const spots = bones.map((node, index) => ({ name: node.name, index, at: avatar.worldToLocal(node.getWorldPosition(new THREE.Vector3())) }));
  const head = spots.find((spot) => spot.name === "Bip01_Head");
  if (head === undefined) throw new Error("no head");
  spots.push({ name: "crown", index: head.index, at: head.at.clone().add(new THREE.Vector3(0, 0, 25)) });
  const positions: number[] = [];
  const normals: number[] = [];
  const skinIndex: number[] = [];
  const skinWeight: number[] = [];
  const triangleOf = new Map<string, number>();
  spots.forEach((spot, triangle) => {
    triangleOf.set(spot.name, triangle);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]] as const) {
      positions.push(spot.at.x + dx, spot.at.y + dy, spot.at.z);
      normals.push(0, 0, 1);
      skinIndex.push(spot.index, 0, 0, 0);
      skinWeight.push(1, 0, 0, 0);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));
  geometry.setIndex(Array.from({ length: positions.length / 3 }, (_, i) => i));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ transparent: options.transparent ?? false }));
  avatar.add(mesh);
  scene.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  return { scene, mesh, triangleOf };
}

function shellsOf(mesh: THREE.Object3D): THREE.SkinnedMesh[] {
  return mesh.children.filter((child): child is THREE.SkinnedMesh => child instanceof THREE.SkinnedMesh);
}

/** The source triangles a shell covers, by the name of the bone each one sits on. */
function covered(shell: THREE.SkinnedMesh, triangleOf: Map<string, number>): string[] {
  const index = shell.geometry.index;
  if (index === null) return [];
  const names = new Map([...triangleOf].map(([name, triangle]) => [triangle, name]));
  const out: string[] = [];
  for (let t = 0; t < index.count; t += 3) out.push(names.get(index.getX(t) / 3) ?? "?");
  return out.sort();
}

function skinnedWorld(mesh: THREE.SkinnedMesh, vertex: number): THREE.Vector3 {
  return mesh.getVertexPosition(vertex, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
}

describe("worn layers on a rigged human", () => {
  test("gloves cover the hands and fingers and nothing else, bound to the body's own skeleton", () => {
    const { scene, mesh, triangleOf } = bipedBody();
    attachWornLayer(scene, { region: "hands" });
    const [shell, ...extra] = shellsOf(mesh);
    if (shell === undefined) throw new Error("no shell");
    expect(extra).toEqual([]);
    expect(shell.skeleton).toBe(mesh.skeleton);
    expect(covered(shell, triangleOf)).toEqual(["Bip01_L_Finger0", "Bip01_L_Hand", "Bip01_R_Finger0", "Bip01_R_Hand"]);
  });

  test("the layer stands off the skin by its share of the body and stays on it through a pose", () => {
    const { scene, mesh, triangleOf } = bipedBody();
    attachWornLayer(scene, { region: "hands", thickness: 0.01 });
    const [shell] = shellsOf(mesh);
    if (shell === undefined) throw new Error("no shell");
    scene.updateMatrixWorld(true);
    const vertex = (triangleOf.get("Bip01_L_Hand") ?? -1) * 3;
    // 0.01 of a 1.6 m span is 16 mm, along the skin's normal.
    expect(skinnedWorld(shell, vertex).distanceTo(skinnedWorld(mesh, vertex))).toBeCloseTo(0.016, 4);

    const elbow = scene.getObjectByName("Bip01_L_Forearm");
    if (elbow === undefined) throw new Error("no forearm");
    const before = skinnedWorld(mesh, vertex);
    elbow.rotation.y = 1.2;
    scene.updateMatrixWorld(true);
    mesh.skeleton.update();
    const after = skinnedWorld(mesh, vertex);
    expect(after.distanceTo(before)).toBeGreaterThan(0.1);
    expect(skinnedWorld(shell, vertex).distanceTo(after)).toBeCloseTo(0.016, 4);
  });

  test("a hat covers the crown, not the face; a top runs from the waist to the collar; boots stop at the shin", () => {
    const { scene, mesh, triangleOf } = bipedBody();
    attachWornLayer(scene, { region: "head" });
    attachWornLayer(scene, { region: "torso" });
    attachWornLayer(scene, { region: "feet" });
    const [hat, top, boots] = shellsOf(mesh);
    if (hat === undefined || top === undefined || boots === undefined) throw new Error("missing shells");
    expect(covered(hat, triangleOf)).toEqual(["crown"]);
    expect(covered(top, triangleOf)).toEqual(["Bip01_L_Forearm", "Bip01_L_UpperArm", "Bip01_Neck", "Bip01_Pelvis", "Bip01_R_Forearm", "Bip01_R_UpperArm", "Bip01_Spine", "Bip01_Spine1", "Bip01_Spine2"]);
    expect(covered(boots, triangleOf)).toEqual(["Bip01_L_Foot", "Bip01_L_Toe0", "Bip01_R_Foot", "Bip01_R_Toe0"]);
  });

  test("the undo takes the layer off and frees its material", () => {
    const { scene, mesh } = bipedBody();
    const off = attachWornLayer(scene, { region: "legs", material: { color: "#6b4f33" } });
    const [shell] = shellsOf(mesh);
    if (shell === undefined) throw new Error("no shell");
    const material = shell.material;
    if (Array.isArray(material) || !(material instanceof THREE.MeshStandardMaterial)) throw new Error("not a standard material");
    expect(`#${material.color.getHexString()}`).toBe("#6b4f33");
    let freed = false;
    material.addEventListener("dispose", () => {
      freed = true;
    });
    off();
    expect(shellsOf(mesh)).toEqual([]);
    expect(freed).toBe(true);
  });

  test("see-through surfaces and rigs that are not a person wear nothing", () => {
    const glass = bipedBody({ transparent: true });
    attachWornLayer(glass.scene, { region: "torso" });
    expect(shellsOf(glass.mesh)).toEqual([]);

    const lone = new THREE.Bone();
    const bones = [lone];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    const blob = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
    blob.add(lone);
    blob.bind(new THREE.Skeleton(bones));
    attachWornLayer(blob, { region: "torso" });
    expect(shellsOf(blob)).toEqual([]);
  });
});
