import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "@jgengine/core/ui/jsx";
import * as THREE from "three";
import { createEmptyEditorDocument, type EditorMarker, type EditorVolume } from "@jgengine/core/editor/index";
import { mountTestDraws, type MountedTestDraws } from "@jgengine/core/frame/testEngineHost.draw";
import { pointInVolume } from "@jgengine/core/scene/authoredTriggers";
import { volumeCenterOnGround } from "@jgengine/core/world/sceneShapes";
import { EditorLayerOverlays, volumeWireframe } from "./DebugDraw";

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

describe("volume gizmo", () => {
  const span = (volume: EditorVolume) => {
    const lines = volumeWireframe(volume);
    let low = Infinity;
    let high = -Infinity;
    for (let i = 1; i < lines.length; i += 3) {
      low = Math.min(low, lines[i]!);
      high = Math.max(high, lines[i]!);
    }
    return { low: volume.center.y + low, high: volume.center.y + high, lines };
  };

  test("a box is drawn centred on center.y, the bounds the runtime contains points in (#3191)", () => {
    const box: EditorVolume = { id: "b", kind: "nav_area", shape: "box", center: { x: 4, y: 3, z: -2 }, halfExtents: { x: 2, y: 1.5, z: 1 } };
    const { low, high, lines } = span(box);
    expect([low, high]).toEqual([1.5, 4.5]);
    for (let i = 0; i < lines.length; i += 3) {
      const corner = { x: box.center.x + lines[i]!, y: box.center.y + lines[i + 1]!, z: box.center.z + lines[i + 2]! };
      expect(pointInVolume(box, corner), `corner ${JSON.stringify(corner)}`).toBe(true);
    }
    expect(pointInVolume(box, { x: 4, y: high + 0.01, z: -2 })).toBe(false);
    expect(pointInVolume(box, { x: 4, y: low - 0.01, z: -2 })).toBe(false);
  });

  test("a cylinder is drawn centred too, its height defaulting to its diameter as containment does", () => {
    expect(span({ id: "c", kind: "zone", shape: "cylinder", center: { x: 0, y: 10, z: 0 }, radius: 3, height: 8 })).toMatchObject({ low: 6, high: 14 });
    expect(span({ id: "c", kind: "zone", shape: "cylinder", center: { x: 0, y: 0, z: 0 }, radius: 3 })).toMatchObject({ low: -3, high: 3 });
  });

  test("a box missing halfExtents draws the size containment assumes", () => {
    const box: EditorVolume = { id: "b", kind: "zone", shape: "box", center: { x: 0, y: 0, z: 0 } };
    expect(span(box)).toMatchObject({ low: -5, high: 5 });
    expect(pointInVolume(box, { x: 0, y: 4.9, z: 0 })).toBe(true);
  });

  test("a volume placed on the ground stands on it: its bottom face is at the ground", () => {
    const ground = { x: 1, y: 2, z: 3 };
    const box = { shape: "box", halfExtents: { x: 8, y: 4, z: 8 } } as const;
    const boxCenter = volumeCenterOnGround(box, ground);
    expect(boxCenter).toEqual({ x: 1, y: 6, z: 3 });
    expect(span({ id: "b", kind: "zone", center: boxCenter, ...box }).low).toBe(2);
    const cylinder = { shape: "cylinder", radius: 10, height: 8 } as const;
    expect(span({ id: "c", kind: "zone", center: volumeCenterOnGround(cylinder, ground), ...cylinder }).low).toBe(2);
    expect(volumeCenterOnGround({ shape: "sphere", radius: 10 }, ground)).toEqual(ground);
  });
});
