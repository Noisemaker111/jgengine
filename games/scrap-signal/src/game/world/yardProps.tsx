/** @jsxImportSource @jgengine/core/ui/jsx */
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry } from "three";
import type { BufferGeometry } from "three";
import type { ReactNode } from "@jgengine/core/ui/jsx";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";

/**
 * Three suburban landmarks no model pack ships, built from primitives: a giant pink lawn flamingo
 * (where the desert's bone arches stood), a hand-painted yard-sale sign, and a wooden telephone pole
 * with its crossbar and transformer (where the turbines stood). Big, bright and readable at range.
 */
type YardProp = "flamingo" | "yardSale" | "pole";

const PROP_BY_CATALOG: Readonly<Record<string, YardProp>> = {
  bone_arch: "flamingo",
  banner_pole: "yardSale",
  wind_turbine: "pole",
};

function paint(color: string, roughness = 0.5): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness, metalness: 0.05, emissive: color, emissiveIntensity: 0.06 });
}

function buildProp(kind: YardProp): { group: Group; dispose(): void } {
  const group = new Group();
  const geometries: BufferGeometry[] = [];
  const materials: MeshStandardMaterial[] = [];
  const mat = (material: MeshStandardMaterial) => { materials.push(material); return material; };
  const add = (geometry: BufferGeometry, material: MeshStandardMaterial, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    group.add(mesh);
  };
  if (kind === "flamingo") {
    const pink = mat(paint("#ff6fb5", 0.35));
    const black = mat(paint("#1b1b1f"));
    add(new CylinderGeometry(0.06, 0.06, 2.6, 8), black, 0.15, 1.3, 0);
    add(new CylinderGeometry(0.06, 0.06, 2.6, 8), black, -0.15, 1.3, 0);
    add(new SphereGeometry(1, 18, 12), pink, 0, 3.2, 0);
    group.children[group.children.length - 1]!.scale.set(1.1, 0.7, 1.6);
    add(new CylinderGeometry(0.16, 0.2, 1.8, 10), pink, 0, 4.3, 1.2, -0.5);
    add(new SphereGeometry(0.35, 14, 10), pink, 0, 5.2, 1.6);
    add(new CylinderGeometry(0.08, 0.16, 0.6, 8), mat(paint("#ffe1ef")), 0, 5.05, 2.05, Math.PI / 2 + 0.4);
    add(new SphereGeometry(0.06, 8, 6), black, 0.2, 5.3, 1.85);
    add(new SphereGeometry(0.06, 8, 6), black, -0.2, 5.3, 1.85);
  } else if (kind === "yardSale") {
    const wood = mat(paint("#b07a45", 0.8));
    add(new BoxGeometry(0.12, 2.4, 0.12), wood, 0, 1.2, 0);
    add(new BoxGeometry(1.8, 1.1, 0.06), mat(paint("#fff6d8", 0.7)), 0, 2.1, 0.08);
    add(new BoxGeometry(1.5, 0.22, 0.02), mat(paint("#e23c2e")), 0, 2.35, 0.12);
    add(new BoxGeometry(1.2, 0.18, 0.02), mat(paint("#2f6fd6")), 0, 2.0, 0.12);
    add(new BoxGeometry(0.8, 0.16, 0.02), mat(paint("#3aa84f")), 0, 1.72, 0.12);
    for (const [x, color] of [[-0.6, "#ffd23f"], [0.6, "#ff5ad1"]] as const) add(new SphereGeometry(0.2, 10, 8), mat(paint(color, 0.3)), x, 2.8, 0.1);
  } else {
    const wood = mat(paint("#6b4a2e", 0.9));
    add(new CylinderGeometry(0.18, 0.24, 14, 10), wood, 0, 7, 0);
    add(new BoxGeometry(3.2, 0.2, 0.2), wood, 0, 12.8, 0);
    add(new BoxGeometry(2.4, 0.16, 0.16), wood, 0, 11.6, 0);
    add(new CylinderGeometry(0.4, 0.4, 1, 12), mat(new MeshStandardMaterial({ color: "#8d959e", roughness: 0.4, metalness: 0.6 })), 0.45, 10.4, 0);
    for (const x of [-1.4, -0.5, 0.5, 1.4]) add(new CylinderGeometry(0.06, 0.06, 0.25, 6), mat(paint("#2e9e4f", 0.2)), x, 13.0, 0);
  }
  return {
    group,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}

function yardDraw(kind: YardProp): EngineDraw {
  const built = buildProp(kind);
  return {
    mount(state: EngineFrameState) {
      state.scene.add(built.group);
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(built.group);
      built.dispose();
    },
  };
}

function YardPropMesh({ kind, id }: { kind: YardProp; id: string }) {
  return <EngineDrawMount create={() => yardDraw(kind)} deps={[id, kind]} />;
}

/** The shell's per-object override for the three primitive-built landmarks; every other prop keeps its model. */
export function renderObject(object: SceneObject): ReactNode {
  const kind = PROP_BY_CATALOG[object.catalogId];
  return kind === undefined ? null : <YardPropMesh kind={kind} id={object.instanceId} />;
}
