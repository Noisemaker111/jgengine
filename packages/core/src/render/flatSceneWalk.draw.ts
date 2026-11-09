import * as THREE from "three";

import { sceneWalkStarts } from "@jgengine/core/visibility/culledTransforms.draw";

interface WalkList {
  finish(): void;
}

/** The renderer parts the flat walk wraps: three's render lists and shadow pass, and its render counter. */
export interface FlatWalkRenderer {
  renderLists: { get(scene: THREE.Object3D, renderCallDepth: number): WalkList };
  shadowMap: { enabled: boolean; autoUpdate: boolean; needsUpdate: boolean; type: THREE.ShadowMapType; render(lights: THREE.Light[], scene: THREE.Object3D, camera: THREE.Camera): void };
  info: { render: { frame: number } };
}

const NO_CHILDREN: THREE.Object3D[] = [];

/**
 * Let three's render walk start from the scene's walk starts instead of the scene. Three walks every
 * node of the scene on each render (and once more for each shadow-casting light), doing nothing at
 * the plain groups, skeleton bones and hidden branches, and on a scene of rigged actors and nested
 * models those are much of what it visits. The scene's matrix pass ({@link skipCulledMatrices}), which
 * three runs at the start of every render, lists the shown nodes three acts on, each with nothing it
 * acts on above it, in walk order. For the walk alone the scene's children are those starts; for that
 * render's shadow pass a stand-in root holds them. Three then reaches the same objects in the same
 * order with the same sort group, so every list, light and shadow map is what it was.
 *
 * Only a render whose own matrix pass ran is flattened (a prepass that reuses the beauty matrices
 * walks the scene), so the starts always reflect the graph as three walks it. A shadow-map type change
 * gets the real scene, which three walks to recompile every material.
 * @internal
 */
export function installFlatSceneWalk(renderer: FlatWalkRenderer, scene: THREE.Object3D): () => void {
  const lists = renderer.renderLists;
  const get = lists.get;
  const shadowMap = renderer.shadowMap;
  const shadowRender = shadowMap.render;
  const finishes = new Map<WalkList, () => void>();
  const stand = new THREE.Object3D();
  let children: THREE.Object3D[] | null = null;
  let consumed = -1;
  let starts: readonly THREE.Object3D[] | null = null;
  let startsFrame = -1;
  let shadowType: THREE.ShadowMapType | null = null;
  let installed = true;

  const restore = () => {
    if (children === null) return;
    scene.children = children;
    children = null;
  };

  const flatGet = function (this: unknown, drawn: THREE.Object3D, depth: number): WalkList {
    restore();
    const list = get.call(lists, drawn, depth);
    if (!installed || drawn !== scene || scene.matrixWorldAutoUpdate !== true) return list;
    // Three ran the matrix pass at the start of this render (`matrixWorldAutoUpdate`): its starts are current.
    const walk = sceneWalkStarts(scene);
    if (walk === undefined || walk.serial === consumed) return list;
    consumed = walk.serial;
    if (!finishes.has(list)) {
      const finish = list.finish;
      finishes.set(list, finish);
      list.finish = function (this: unknown) {
        restore();
        finish.call(this);
      };
    }
    children = scene.children;
    scene.children = walk.starts as THREE.Object3D[];
    starts = walk.starts;
    // Three counts the render right after taking its list; its shadow pass runs under that count.
    startsFrame = renderer.info.render.frame + 1;
    return list;
  };

  const flatShadows = function (this: unknown, lights: THREE.Light[], drawn: THREE.Object3D, camera: THREE.Camera): void {
    const type = shadowMap.type;
    const typeChanged = type !== shadowType;
    // Three notes the type only once a pass gets past its early returns.
    if (shadowMap.enabled && (shadowMap.autoUpdate || shadowMap.needsUpdate) && lights.length > 0) shadowType = type;
    if (!installed || drawn !== scene || starts === null || startsFrame !== renderer.info.render.frame || typeChanged) {
      shadowRender.call(this, lights, drawn, camera);
      return;
    }
    stand.children = starts as THREE.Object3D[];
    try {
      shadowRender.call(this, lights, stand, camera);
    } finally {
      stand.children = NO_CHILDREN;
    }
  };

  lists.get = flatGet;
  shadowMap.render = flatShadows;
  return () => {
    installed = false;
    restore();
    if (lists.get === flatGet) lists.get = get;
    if (shadowMap.render === flatShadows) shadowMap.render = shadowRender;
    for (const [list, finish] of finishes) list.finish = finish;
    finishes.clear();
    starts = null;
  };
}
