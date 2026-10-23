import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import {
  POSTFX_OVERLAY_USERDATA,
  hidePostfxOverlays,
  isPostfxOverlay,
  releasePostfxOverlayTracking,
  restorePostfxOverlays,
} from "./postfxOverlay";

function markedGroup(): THREE.Group {
  const group = new THREE.Group();
  Object.assign(group.userData, POSTFX_OVERLAY_USERDATA);
  return group;
}

describe("postfxOverlay", () => {
  test("isPostfxOverlay only matches the marker", () => {
    expect(isPostfxOverlay(markedGroup())).toBe(true);
    expect(isPostfxOverlay(new THREE.Group())).toBe(false);
    expect(isPostfxOverlay({ userData: { jgPostfxOverlay: "yes" } })).toBe(false);
  });

  test("hide/restore round-trips marked subtrees and leaves the rest alone", () => {
    const scene = new THREE.Scene();
    const world = new THREE.Group();
    const vfx = markedGroup();
    const sprite = new THREE.Sprite();
    vfx.add(sprite);
    scene.add(world, vfx);

    const hidden: THREE.Object3D[] = [];
    hidePostfxOverlays(scene, hidden);
    expect(vfx.visible).toBe(false);
    expect(sprite.visible).toBe(true); // parent hides the subtree for the renderer
    expect(world.visible).toBe(true);
    expect(hidden).toEqual([vfx]);

    restorePostfxOverlays(hidden);
    expect(vfx.visible).toBe(true);
    expect(hidden).toHaveLength(0);
  });

  test("already-hidden marked objects stay hidden after restore", () => {
    const scene = new THREE.Scene();
    const off = markedGroup();
    off.visible = false;
    const on = markedGroup();
    scene.add(off, on);

    const hidden: THREE.Object3D[] = [];
    hidePostfxOverlays(scene, hidden);
    expect(hidden).toEqual([on]);
    restorePostfxOverlays(hidden);
    expect(off.visible).toBe(false);
    expect(on.visible).toBe(true);
  });

  test("hide clears stale entries from a reused list", () => {
    const scene = new THREE.Scene();
    const vfx = markedGroup();
    scene.add(vfx);
    const hidden: THREE.Object3D[] = [new THREE.Group()];
    hidePostfxOverlays(scene, hidden);
    expect(hidden).toEqual([vfx]);
  });

  test("an overlay mounted after the first scan is hidden without another scan", () => {
    const scene = new THREE.Scene();
    const world = new THREE.Group();
    const inner = new THREE.Group();
    world.add(inner);
    scene.add(world);
    const hidden: THREE.Object3D[] = [];
    hidePostfxOverlays(scene, hidden);
    restorePostfxOverlays(hidden);

    const vfx = markedGroup();
    inner.add(vfx);

    hidePostfxOverlays(scene, hidden);
    expect(hidden).toEqual([vfx]);
    restorePostfxOverlays(hidden);
    expect(vfx.visible).toBe(true);
  });

  test("an overlay removed from the scene is not reported again", () => {
    const scene = new THREE.Scene();
    const vfx = markedGroup();
    scene.add(vfx);
    const hidden: THREE.Object3D[] = [];
    hidePostfxOverlays(scene, hidden);
    restorePostfxOverlays(hidden);

    scene.remove(vfx);

    hidePostfxOverlays(scene, hidden);
    expect(hidden).toHaveLength(0);
  });

  test("a prepass hides from the cached set instead of walking the scene", () => {
    const scene = new THREE.Scene();
    const vfx = markedGroup();
    scene.add(new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())), vfx);
    const hidden: THREE.Object3D[] = [];
    hidePostfxOverlays(scene, hidden);
    restorePostfxOverlays(hidden);

    let walks = 0;
    const walk = scene.traverse.bind(scene);
    scene.traverse = ((visit: (object: THREE.Object3D) => void) => {
      walks += 1;
      walk(visit);
    }) as THREE.Object3D["traverse"];

    for (let frame = 0; frame < 3; frame += 1) {
      hidePostfxOverlays(scene, hidden);
      restorePostfxOverlays(hidden);
    }
    expect(walks).toBe(0);
    expect(hidden).toHaveLength(0);
    expect(vfx.visible).toBe(true);
  });

  test("the AO prepass also hides points and lines, the depth prepass keeps them", () => {
    const scene = new THREE.Scene();
    const points = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial());
    const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
    scene.add(points, line);
    const hidden: THREE.Object3D[] = [];

    hidePostfxOverlays(scene, hidden);
    expect(hidden).toHaveLength(0);
    expect(points.visible).toBe(true);

    hidePostfxOverlays(scene, hidden, true);
    expect(hidden).toEqual([points, line]);
    restorePostfxOverlays(hidden);
    expect(points.visible).toBe(true);
    expect(line.visible).toBe(true);
  });

  test("releasing a scene's tracking drops its listeners and starts over", () => {
    const scene = new THREE.Scene();
    const hidden: THREE.Object3D[] = [];
    hidePostfxOverlays(scene, hidden);
    releasePostfxOverlayTracking(scene);

    const vfx = markedGroup();
    scene.add(vfx);
    hidePostfxOverlays(scene, hidden);
    expect(hidden).toEqual([vfx]);
  });
});
