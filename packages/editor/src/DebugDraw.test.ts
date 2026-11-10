import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import * as THREE from "three";
import { createEmptyEditorDocument, type EditorMarker } from "@jgengine/core/editor/index";
import { mountTestDraws, type MountedTestDraws } from "@jgengine/core/frame/testEngineHost.draw";
import { EditorLayerOverlays } from "./DebugDraw";

const mountedDraws: MountedTestDraws[] = [];

afterEach(async () => {
  for (const mounted of mountedDraws.splice(0)) await mounted.unmount();
});

async function harness(marker: EditorMarker) {
  const document = { ...createEmptyEditorDocument(), markers: [marker] };
  let mounted: MountedTestDraws | undefined;
  const render = async (selected = false, hovered = false) => {
    const element = createElement(EditorLayerOverlays, {
      document, visibility: {}, selection: selected ? [marker.id] : [], hoverId: hovered ? marker.id : null,
    });
    if (mounted === undefined) mounted = await mountTestDraws(element, { width: 100, height: 100 });
    else await mounted.render(element);
    mountedDraws.push(mounted);
    for (let i = 0; i < 3; i += 1) await mounted.advance(1 / 60);
  };
  const glyph = () => {
    let found: THREE.Object3D | undefined;
    mounted!.scene.traverse((object) => { if (object.userData.jgEditorId === marker.id) found = object; });
    return found!;
  };
  return { render, glyph, unmount: async () => { await mounted?.unmount(); mountedDraws.splice(mountedDraws.indexOf(mounted!), 1); } };
}

function sphereMeshes(glyph: THREE.Object3D): THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] {
  return glyph.children.filter((object) => (object as THREE.Mesh).geometry?.type === "SphereGeometry") as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[];
}

describe("model-backed marker glyphs", () => {
  test("catalog-backed Knight handles keep their pick surface and emphasis without filled spheres", async () => {
    const marker: EditorMarker = { id: "character-proof-knight", kind: "prop", catalogId: "kaykit-adventurers/Knight", position: { x: 0, y: 0, z: 0 } };
    const h = await harness(marker);
    for (const [selected, hovered, scale, color] of [[false, false, 1, "#ffffff"], [false, true, 1.12, "#22d3ee"], [true, false, 1.28, "#67e8f9"]] as const) {
      await h.render(selected, hovered);
      const glyph = h.glyph();
      glyph.updateWorldMatrix(true, true);
      expect(glyph.position.toArray()).toEqual([0, 1.2, 0]);
      expect(glyph.scale.toArray()).toEqual([scale, scale, scale]);
      const spheres = sphereMeshes(glyph);
      expect(spheres).toHaveLength(selected || hovered ? 2 : 1);
      for (const sphere of spheres) {
        expect(sphere.material.wireframe).toBe(true);
        expect(sphere.material.depthWrite).toBe(false);
        expect(new THREE.Color(sphere.material.color).getHexString()).toBe(color.slice(1));
        expect(sphere.geometry.parameters.radius).toBe(0.85);
      }
      const ray = new THREE.Raycaster(new THREE.Vector3(0, 1.2, 5), new THREE.Vector3(0, 0, -1));
      const hit = ray.intersectObject(glyph, true)[0]!;
      expect(hit.object.parent!.userData.jgEditorId).toBe(marker.id);
      const cone = glyph.children.find((object) => (object as THREE.Mesh).geometry?.type === "ConeGeometry") as THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
      expect(cone.position.toArray()).toEqual([0, 1.35, 0]);
      expect(cone.material.wireframe).toBe(false);
    }
  });

  test("legacy catalog metadata receives the same open glyph", async () => {
    const h = await harness({ id: "legacy-knight", kind: "prop", meta: { catalogId: "kaykit-adventurers/Knight" }, position: { x: 0, y: 0, z: 0 } });
    await h.render(true);
    expect(sphereMeshes(h.glyph()).every((sphere) => sphere.material.wireframe && !sphere.material.depthWrite)).toBe(true);
  });

  test("unbound logical markers retain their filled selection glyph", async () => {
    const h = await harness({ id: "spawn", kind: "player_spawn", position: { x: 0, y: 0, z: 0 } });
    await h.render(true);
    const spheres = sphereMeshes(h.glyph());
    expect(spheres).toHaveLength(2);
    expect(spheres[0]!.material.wireframe).toBe(false);
    expect(spheres[0]!.material.depthWrite).toBe(true);
    expect(spheres[0]!.material.opacity).toBe(1);
    expect(spheres[1]!.material.wireframe).toBe(false);
    expect(spheres[1]!.material.depthWrite).toBe(false);
    expect(spheres[1]!.material.opacity).toBe(0.28);
  });
});
