import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import {
  POSTFX_OVERLAY_USERDATA,
  hidePostfxOverlays,
  isPostfxOverlay,
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
});
