import { expect, test } from "bun:test";
import * as THREE from "three";

import { freezeStaticTransforms } from "@jgengine/core/model/staticTransforms.draw";
import { sceneWalkStarts, setCulled, skipCulledMatrices } from "@jgengine/core/visibility/culledTransforms.draw";

import { installFlatSceneWalk, type FlatWalkRenderer } from "./flatSceneWalk.draw";

type Any = THREE.Object3D & Record<string, unknown>;

/**
 * A renderer that walks like three r187's `WebGLRenderer.render`: the matrix pass, the list, the
 * counted render, `projectObject`, `finish`, then the shadow pass's walk per light. It logs every
 * object three would act on, with the sort group it would get, so two renders can be compared.
 */
function walkingRenderer(): FlatWalkRenderer & { render(scene: THREE.Scene, camera: THREE.Camera): string[] } {
  let log: string[] = [];
  const lists = new Map<string, { finish(): void }>();
  const renderer = {
    info: { render: { frame: 0 } },
    renderLists: {
      get(scene: THREE.Object3D, depth: number) {
        const key = `${scene.id}:${depth}`;
        let list = lists.get(key);
        if (list === undefined) {
          list = { finish: () => log.push("finish") };
          lists.set(key, list);
        }
        return list;
      },
    },
    shadowMap: {
      enabled: true,
      autoUpdate: true,
      needsUpdate: false,
      type: THREE.PCFShadowMap as THREE.ShadowMapType,
      render(lights: THREE.Light[], scene: THREE.Object3D) {
        if (lights.length === 0) return;
        for (const light of lights) {
          const visit = (object: THREE.Object3D): void => {
            if (object.visible === false) return;
            const any = object as Any;
            if (object.layers.test(light.shadow.camera.layers) && (any["isMesh"] || any["isLine"] || any["isPoints"]) && object.castShadow) log.push(`shadow ${light.id} ${object.id}`);
            for (const child of object.children) visit(child);
          };
          visit(scene);
        }
      },
    },
    render(scene: THREE.Scene, camera: THREE.Camera): string[] {
      log = [];
      if (scene.matrixWorldAutoUpdate) scene.updateMatrixWorld();
      const lights: THREE.Light[] = [];
      const list = renderer.renderLists.get(scene, 0);
      renderer.info.render.frame += 1;
      const project = (object: THREE.Object3D, groupOrder: number): void => {
        if (object.visible === false) return;
        const any = object as Any;
        if (object.layers.test(camera.layers)) {
          if (any["isGroup"]) groupOrder = object.renderOrder;
          else if (any["isLOD"]) {
            if ((object as THREE.LOD).autoUpdate) (object as THREE.LOD).update(camera);
            log.push(`lod ${object.id}`);
          } else if (any["isLight"]) {
            lights.push(object as THREE.Light);
            log.push(`light ${object.id}`);
          } else if (any["isSprite"] || any["isMesh"] || any["isLine"] || any["isPoints"]) log.push(`draw ${object.id} group ${groupOrder} order ${object.renderOrder}`);
        }
        for (const child of object.children) project(child, groupOrder);
      };
      project(scene, 0);
      list.finish();
      renderer.shadowMap.render(lights.filter((light) => light.castShadow), scene, camera);
      return log;
    },
  };
  return renderer;
}

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** A random scene with every node kind three's walk treats differently, hidden, culled and frozen branches. */
function randomScene(seed: number): THREE.Scene {
  const random = seeded(seed);
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  const make = (): THREE.Object3D => {
    const roll = random();
    if (roll < 0.25) return new THREE.Mesh(geometry, material);
    if (roll < 0.3) return new THREE.Points(geometry, new THREE.PointsMaterial());
    if (roll < 0.34) return new THREE.Line(geometry, new THREE.LineBasicMaterial());
    if (roll < 0.38) return new THREE.Sprite(new THREE.SpriteMaterial());
    if (roll < 0.42) {
      const light = random() < 0.5 ? new THREE.DirectionalLight() : new THREE.PointLight();
      light.castShadow = random() < 0.5;
      return light;
    }
    if (roll < 0.46) {
      const lod = new THREE.LOD();
      lod.addLevel(new THREE.Mesh(geometry, material), 0);
      lod.addLevel(new THREE.Mesh(geometry, material), 20);
      return lod;
    }
    if (roll < 0.62) {
      const group = new THREE.Group();
      if (random() < 0.4) group.renderOrder = Math.floor(random() * 4) - 1;
      return group;
    }
    if (roll < 0.78) return new THREE.Bone();
    return new THREE.Object3D();
  };
  const grow = (parent: THREE.Object3D, depth: number): void => {
    const count = depth > 5 ? 0 : Math.floor(random() * 4);
    for (let index = 0; index < count; index += 1) {
      const node = make();
      node.castShadow = random() < 0.6;
      node.renderOrder = node instanceof THREE.Group ? node.renderOrder : Math.floor(random() * 3);
      if (random() < 0.12) node.visible = false;
      if (random() < 0.1) node.layers.set(2);
      node.position.set(random() * 10, random() * 10, random() * 10);
      parent.add(node);
      if (!(node instanceof THREE.LOD)) grow(node, depth + 1);
    }
  };
  grow(scene, 0);
  const all: THREE.Object3D[] = [];
  scene.traverse((node) => {
    if (node !== scene) all.push(node);
  });
  for (const node of all) {
    const roll = random();
    if (roll < 0.05 && node.parent !== null) {
      node.visible = false;
      setCulled(node, true);
    } else if (roll < 0.08) freezeStaticTransforms(node);
  }
  return scene;
}

test("three acts on the same objects, in the same order and sort groups, with the flat walk as without it", () => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(5, 5, 30);
  camera.updateMatrixWorld();
  for (let seed = 1; seed <= 60; seed += 1) {
    const scene = randomScene(seed);
    skipCulledMatrices(scene);
    const renderer = walkingRenderer();
    const plain = renderer.render(scene, camera);
    const uninstall = installFlatSceneWalk(renderer, scene);
    const flat = renderer.render(scene, camera);
    expect(flat).toEqual(plain);
    // The real children are back once the walk is over.
    expect(scene.children.every((child) => child.parent === scene)).toBe(true);
    uninstall();
  }
});

test("the flat walk visits fewer nodes: plain groups, bones and hidden branches above what draws are skipped", () => {
  const scene = new THREE.Scene();
  skipCulledMatrices(scene);
  const rig = new THREE.Group();
  const armature = new THREE.Object3D();
  let bone: THREE.Object3D = armature;
  for (let index = 0; index < 30; index += 1) {
    const next = new THREE.Bone();
    bone.add(next);
    bone = next;
  }
  const skin = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  rig.add(armature, skin);
  const hidden = new THREE.Group();
  hidden.visible = false;
  hidden.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
  scene.add(rig, hidden);
  scene.updateMatrixWorld();
  expect(sceneWalkStarts(scene)?.starts).toEqual([skin]);
});

test("a render that reuses the beauty matrices walks the real scene, and a shadow type change gets the real scene", () => {
  const scene = randomScene(7);
  skipCulledMatrices(scene);
  const camera = new THREE.PerspectiveCamera();
  const renderer = walkingRenderer();
  installFlatSceneWalk(renderer, scene);
  const seen: THREE.Object3D[] = [];
  const get = renderer.renderLists.get;
  renderer.renderLists.get = (drawn, depth) => {
    const list = get.call(renderer.renderLists, drawn, depth);
    seen.push(...scene.children);
    return list;
  };
  scene.matrixWorldAutoUpdate = false;
  renderer.render(scene, camera);
  expect(seen.every((child) => child.parent === scene)).toBe(true);
  scene.matrixWorldAutoUpdate = true;

  const shadowScenes: THREE.Object3D[] = [];
  const shadowRender = renderer.shadowMap.render;
  const inner = (lights: THREE.Light[], drawn: THREE.Object3D, cam: THREE.Camera) => {
    shadowScenes.push(drawn);
    shadowRender.call(renderer.shadowMap, lights, drawn, cam);
  };
  const scene2 = new THREE.Scene();
  skipCulledMatrices(scene2);
  const light = new THREE.DirectionalLight();
  light.castShadow = true;
  scene2.add(light, new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
  const renderer2 = walkingRenderer();
  renderer2.shadowMap.render = inner;
  installFlatSceneWalk(renderer2, scene2);
  renderer2.render(scene2, camera);
  renderer2.render(scene2, camera);
  renderer2.shadowMap.type = THREE.BasicShadowMap;
  renderer2.render(scene2, camera);
  expect(shadowScenes.map((drawn) => drawn === scene2)).toEqual([true, false, true]);
});
