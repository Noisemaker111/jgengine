import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { createObjectStore } from "@jgengine/core/scene/objectStore";
import { createModelVariantSelector } from "@jgengine/core/world/modelLod";
import { lodBandIndex } from "@jgengine/core/world/lod";
import { EntityModel, IsolatedEntityModel, SingleVariantModel } from "./SceneModels";
import { singleVariantLevel, singleVariantModel } from "./singleVariantLod";
import { attributeTriangles } from "./triangleAttribution";

const FULL_TRIANGLES = 9134;
const FAR_TRIANGLES = 4110;

/** Harbor's palm species as the game declares it: the same asset url on the near level, a decimated one far. */
const PALM: ModelConfig = {
  url: "mainsail-palm.glb",
  targetHeight: 7.6,
  anchor: "origin",
  variants: {
    levels: [
      { url: "mainsail-palm.glb", maxDistance: 60 },
      { url: "mainsail-palm-lod1.glb" },
    ],
  },
};

/** The Harbor lane's repro shape: the near level ends almost at the camera, and the far level is a visibly different asset. */
const HARBOR_SHAPE: ModelConfig = {
  url: "mainsail-palm.glb",
  targetHeight: 7.6,
  anchor: "origin",
  variants: {
    levels: [
      { url: "mainsail-palm.glb", maxDistance: 0.5 },
      { url: "dispatch-booth.glb" },
    ],
  },
};

const ASSETS: Record<string, number> = {
  "mainsail-palm.glb": FULL_TRIANGLES,
  "mainsail-palm-lod1.glb": FAR_TRIANGLES,
  "dispatch-booth.glb": 1_820,
};

/** One-mesh GLB stand-in carrying exactly `triangles` triangles, so a drawn count is a real triangle count. */
function assetScene(triangles: number): THREE.Group {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 7.6, 0]), 3));
  const index = new Uint32Array(triangles * 3);
  for (let i = 0; i < index.length; i += 1) index[i] = i % 3;
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: "#3f6b32" })));
  return root;
}

interface Frame {
  url: string;
  triangles: number;
  geometry: THREE.BufferGeometry;
}

/**
 * Draws the isolated path's frame for one level: the level's model, its asset mounted the way
 * `EntityModel` mounts a GLB, and the triangles that mount submits.
 */
function drawFrame(model: ModelConfig, level: number): Frame {
  const drawn = singleVariantModel(model, level);
  const triangles = ASSETS[drawn.url]!;
  const scene = new THREE.Scene();
  scene.add(assetScene(triangles));
  const mesh = scene.children[0]!.children[0] as THREE.Mesh;
  return { url: drawn.url, triangles: attributeTriangles(scene).triangles, geometry: mesh.geometry };
}

/** A runtime placement, the way `setup.ts` puts Harbor's tree line down. */
function placeRuntime(store: ReturnType<typeof createObjectStore>, model: ModelConfig, x: number, z: number): { id: string; model: ModelConfig } {
  const id = store.place("obj_palm", x, 0, z, { rotation: 0.4 });
  return { id, model };
}

describe("single object variant levels", () => {
  test("a prop placed at runtime switches asset past 60 m and drops its triangles by the level's ratio", () => {
    const store = createObjectStore();
    const { id } = placeRuntime(store, PALM, 0, 0);
    const placed = store.get(id)!;
    const selector = createModelVariantSelector(PALM.variants!);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    const cameraAt = new THREE.Vector3();
    const probe = new THREE.Vector3();

    camera.position.set(0, 0, -40);
    const near = singleVariantLevel(selector, id, camera, placed.position, cameraAt, probe);
    const nearFrame = drawFrame(PALM, near);
    expect(near).toBe(0);
    expect(nearFrame.url).toBe("mainsail-palm.glb");
    expect(nearFrame.triangles).toBe(FULL_TRIANGLES);

    camera.position.set(0, 0, -80);
    const far = singleVariantLevel(selector, id, camera, placed.position, cameraAt, probe);
    const farFrame = drawFrame(PALM, far);
    expect(far).toBe(1);
    expect(farFrame.url).toBe("mainsail-palm-lod1.glb");
    expect(farFrame.triangles).toBe(FAR_TRIANGLES);

    // The drawn mesh itself changed, not just the label on it.
    expect(farFrame.geometry).not.toBe(nearFrame.geometry);
    expect(FAR_TRIANGLES / FULL_TRIANGLES).toBeCloseTo(0.45, 2);
    expect(nearFrame.triangles - farFrame.triangles).toBe(5024);
  });

  test("a camera parked at 60 m does not flip over 120 frames", () => {
    const store = createObjectStore();
    const { id } = placeRuntime(store, PALM, 0, 0);
    const placed = store.get(id)!;
    const boundary = PALM.variants!.levels[0]!.maxDistance;
    const selector = createModelVariantSelector(PALM.variants!);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    const cameraAt = new THREE.Vector3();
    const probe = new THREE.Vector3();

    expect(lodBandIndex(PALM.variants!.levels, boundary)).toBe(0);
    const drawnByLevel = new Map<number, ModelConfig>();
    const frames: number[] = [];
    const models: ModelConfig[] = [];
    for (let frame = 0; frame < 120; frame += 1) {
      camera.position.set(0, 0, -boundary + Math.sin(frame / 7) * 0.4);
      const level = singleVariantLevel(selector, id, camera, placed.position, cameraAt, probe);
      frames.push(level);
      // The component's `useMemo` key: a level that never changes never rebuilds the model.
      let drawn = drawnByLevel.get(level);
      if (drawn === undefined) drawnByLevel.set(level, (drawn = singleVariantModel(PALM, level)));
      models.push(drawn);
    }

    expect(frames.every((level) => level === 0)).toBe(true);
    expect(new Set(models).size).toBe(1);
    expect(selector.size()).toBe(1);
  });

  test("the Harbor shape: a 0.5 m near level with a different far asset changes the frame", () => {
    const store = createObjectStore();
    // Harbor's tree line is placed at runtime in setup.ts, never authored, so it draws on its own.
    const { id } = placeRuntime(store, HARBOR_SHAPE, 0, 0);
    const placed = store.get(id)!;
    const selector = createModelVariantSelector(HARBOR_SHAPE.variants!);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    const cameraAt = new THREE.Vector3();
    const probe = new THREE.Vector3();

    // 20 m out: the near level ends at 0.5 m, so this prop is entirely on the far level.
    camera.position.set(0, 0, -20);
    const level = singleVariantLevel(selector, id, camera, placed.position, cameraAt, probe);
    const frame = drawFrame(HARBOR_SHAPE, level);

    expect(level).toBe(1);
    // The shipped single path drew `model.url` at every distance, which is this url: the frame could
    // not change however the far level was configured.
    expect(HARBOR_SHAPE.url).toBe("mainsail-palm.glb");
    expect(frame.url).toBe("dispatch-booth.glb");
    expect(frame.triangles).toBe(1_820);
    expect(frame.triangles).not.toBe(attributeTriangles(assetScene(FULL_TRIANGLES)).triangles);
  });

  test("a model without variants draws its own asset and an out-of-range level clamps", () => {
    const plain: ModelConfig = { url: "mainsail-palm.glb" };
    expect(singleVariantModel(plain, 0)).toBe(plain);
    expect(singleVariantModel(PALM, 5).url).toBe("mainsail-palm-lod1.glb");
    expect(singleVariantModel(PALM, -2).url).toBe("mainsail-palm.glb");
    expect(singleVariantModel(PALM, 1).variants).toBeUndefined();
  });
});

describe("isolated path wiring", () => {
  test("an isolated model with variants mounts the level switch, not the fixed asset", () => {
    const element = IsolatedEntityModel({ model: PALM, instanceId: "palm-1" }) as {
      props: { children: { props: { children: { type: unknown; props: { model: ModelConfig } } } } };
    };
    const child = element.props.children.props.children;
    expect(child.type).toBe(SingleVariantModel);
    expect(child.props.model).toBe(PALM);
  });

  test("an isolated model without variants keeps the plain renderer", () => {
    const plain: ModelConfig = { url: "mainsail-palm.glb" };
    const element = IsolatedEntityModel({ model: plain, instanceId: "palm-1" }) as {
      props: { children: { props: { children: { type: unknown } } } };
    };
    expect(element.props.children.props.children.type).toBe(EntityModel);
  });
});
