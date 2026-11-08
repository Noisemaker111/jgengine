import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import {
  POSTFX_OVERLAY_USERDATA,
  drawPrepassExcluding,
  excludesOverlays,
  excludesOverlaysAndUnmodelled,
  isPostfxOverlay,
  type PrepassRenderList,
} from "./postfxOverlay.draw";
import { excludesFromOutline } from "./stylizePass.draw";

function markedGroup(): THREE.Group {
  const group = new THREE.Group();
  Object.assign(group.userData, POSTFX_OVERLAY_USERDATA);
  return group;
}

function mesh(material: THREE.Material = new THREE.MeshStandardMaterial()): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(), material);
}

/**
 * A renderer that builds its list the way three's does: a walk that stops at hidden nodes, the
 * list's `finish`, then one draw per item in order. Lists are kept per scene and reused.
 */
function listRenderer() {
  const lists = new Map<THREE.Object3D, PrepassRenderList>();
  const drawn: THREE.Object3D[] = [];
  const renderer = {
    renderLists: {
      get(scene: THREE.Object3D, _depth: number): PrepassRenderList {
        let list = lists.get(scene);
        if (list === undefined) {
          list = { opaque: [], transmissive: [], transparent: [], finish: () => {} };
          lists.set(scene, list);
        }
        return list;
      },
    },
    render(scene: THREE.Object3D): void {
      const list = renderer.renderLists.get(scene, 0);
      list.opaque.length = 0;
      list.transparent.length = 0;
      const project = (node: THREE.Object3D): void => {
        if (!node.visible) return;
        if ((node as THREE.Mesh).isMesh === true || (node as THREE.Points).isPoints === true || (node as THREE.Line).isLine === true || (node as THREE.Sprite).isSprite === true) {
          const material = (node as THREE.Mesh).material as THREE.Material;
          (material.transparent ? list.transparent : list.opaque).push({ object: node });
        }
        for (const child of node.children) project(child);
      };
      project(scene);
      list.finish();
      for (const item of [...list.opaque, ...list.transparent]) drawn.push(item.object);
    },
  };
  return { renderer, drawn };
}

/** What the prepass drew when the excluded subtrees were hidden instead, the way it used to. */
function drawnWhenHidden(scene: THREE.Scene, excluded: (node: THREE.Object3D) => boolean): THREE.Object3D[] {
  const hidden: THREE.Object3D[] = [];
  scene.traverseVisible((node) => {
    if (node === scene || !excluded(node)) return;
    hidden.push(node);
  });
  for (const node of hidden) node.visible = false;
  const { renderer, drawn } = listRenderer();
  renderer.render(scene);
  for (const node of hidden) node.visible = true;
  return drawn;
}

function mixedScene() {
  const scene = new THREE.Scene();
  const world = new THREE.Group();
  const wall = mesh();
  const crate = mesh();
  const glass = mesh(new THREE.MeshStandardMaterial({ transparent: true }));
  const vfx = markedGroup();
  const spark = mesh();
  const sparkChild = mesh();
  spark.add(sparkChild);
  vfx.add(spark);
  const points = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial());
  const underPoints = mesh();
  points.add(underPoints);
  const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
  const sprite = new THREE.Sprite();
  const leaf = mesh(new THREE.MeshStandardMaterial({ alphaTest: 0.5 }));
  world.add(wall, vfx, crate, points, glass, line, sprite, leaf);
  scene.add(world);
  return { scene, wall, crate, glass, vfx, spark, sparkChild, points, underPoints, line, sprite, leaf };
}

describe("postfx prepass exclusion", () => {
  test("isPostfxOverlay only matches the marker", () => {
    expect(isPostfxOverlay(markedGroup())).toBe(true);
    expect(isPostfxOverlay(new THREE.Group())).toBe(false);
    expect(isPostfxOverlay({ userData: { jgPostfxOverlay: "yes" } })).toBe(false);
  });

  test.each([
    ["overlays", excludesOverlays],
    ["overlays, points and lines", excludesOverlaysAndUnmodelled],
    ["what an outline must not see", excludesFromOutline],
  ])("leaving out %s draws exactly what hiding those subtrees drew, in the same order", (_name, excluded) => {
    const { scene } = mixedScene();
    const expected = drawnWhenHidden(scene, excluded);
    const { renderer, drawn } = listRenderer();
    drawPrepassExcluding(renderer, scene, excluded, () => renderer.render(scene));
    expect(drawn).toEqual(expected);
    expect(drawn.length).toBeGreaterThan(0);
  });

  test("overlay subtrees are left out and the rest is drawn, with nothing written on the scene", () => {
    const { scene, wall, crate, glass, vfx, spark, sparkChild, points } = mixedScene();
    const { renderer, drawn } = listRenderer();
    drawPrepassExcluding(renderer, scene, excludesOverlays, () => renderer.render(scene));
    expect(drawn).toContain(wall);
    expect(drawn).toContain(crate);
    expect(drawn).toContain(glass);
    expect(drawn).toContain(points);
    expect(drawn).not.toContain(spark);
    expect(drawn).not.toContain(sparkChild);
    scene.traverse((node) => {
      expect(node.visible).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(node, "_listeners")).toBe(false);
    });
    expect(vfx.visible).toBe(true);
  });

  test("the AO prepass also leaves out points and lines with their children, the depth prepass keeps them", () => {
    const { scene, points, underPoints, line } = mixedScene();
    const depth = listRenderer();
    drawPrepassExcluding(depth.renderer, scene, excludesOverlays, () => depth.renderer.render(scene));
    expect(depth.drawn).toContain(points);
    expect(depth.drawn).toContain(line);
    const ao = listRenderer();
    drawPrepassExcluding(ao.renderer, scene, excludesOverlaysAndUnmodelled, () => ao.renderer.render(scene));
    expect(ao.drawn).not.toContain(points);
    expect(ao.drawn).not.toContain(underPoints);
    expect(ao.drawn).not.toContain(line);
  });

  test("draws of anything but the prepass's scene are left alone", () => {
    const { scene } = mixedScene();
    const quad = markedGroup().add(mesh(new THREE.ShaderMaterial()));
    const { renderer, drawn } = listRenderer();
    drawPrepassExcluding(renderer, scene, excludesFromOutline, () => renderer.render(quad));
    expect(drawn).toHaveLength(1);
  });

  test("the scene's next render draws everything again, even after a prepass throws", () => {
    const { scene, spark } = mixedScene();
    const { renderer, drawn } = listRenderer();
    const get = renderer.renderLists.get;
    const error = new Error("prepass failed");
    expect(() => drawPrepassExcluding(renderer, scene, excludesOverlays, () => {
      renderer.render(scene);
      throw error;
    })).toThrow(error);
    expect(drawn).not.toContain(spark);
    expect(renderer.renderLists.get).toBe(get);
    drawn.length = 0;
    renderer.render(scene);
    expect(drawn).toContain(spark);
  });

  test("a prepass inside another leaves out what either excludes", () => {
    const { scene, spark, points, wall } = mixedScene();
    const { renderer, drawn } = listRenderer();
    drawPrepassExcluding(renderer, scene, excludesOverlays, () =>
      drawPrepassExcluding(renderer, scene, (node) => (node as THREE.Points).isPoints === true, () => renderer.render(scene)));
    expect(drawn).toContain(wall);
    expect(drawn).not.toContain(spark);
    expect(drawn).not.toContain(points);
  });
});
