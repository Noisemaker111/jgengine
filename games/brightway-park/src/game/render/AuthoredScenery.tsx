/** @jsxImportSource @jgengine/core/ui/jsx */
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Color, Mesh, MeshStandardMaterial, type Material, type Object3D } from "three";

import { editorLayers } from "../../editorLayers";
import { assets } from "../assets";
import type { EngineDraw } from "@jgengine/core/frame/engineLoop.draw";
import { loadDraw } from "@jgengine/core/frame/loadDraw.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

interface SceneryPlacement {
  id: string;
  url: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  lift: number;
  /** How far its colours are pulled into the night (0 keeps them, 1 is all night violet). */
  night: number;
}

/** The haunt's night: the colour every authored scenery piece's surfaces are drawn toward. */
const NIGHT = new Color("#1e1a36");
/** The town behind the fence goes darkest; plants keep more of their colour. */
const TOWN_NIGHT = 0.74;
const PLANT_NIGHT = 0.3;
/** Lit windows: the town's darkest surfaces glow a dim lantern amber. */
const WINDOW_GLOW = new Color("#ffb347");

const graded = new WeakMap<Material, Map<number, Material>>();

/** A scenery material pulled toward the night, cached per source material and strength. */
function nightMaterial(source: Material | Material[], night: number): Material | Material[] {
  if (Array.isArray(source)) return source.map((one) => nightMaterial(one, night) as Material);
  if (!(source instanceof MeshStandardMaterial)) return source;
  let byNight = graded.get(source);
  if (byNight === undefined) { byNight = new Map(); graded.set(source, byNight); }
  const cached = byNight.get(night);
  if (cached !== undefined) return cached;
  const copy = source.clone();
  const hsl = { h: 0, s: 0, l: 0 };
  source.color.getHSL(hsl);
  copy.color.lerp(NIGHT, night);
  // The town's darkest surfaces (glass, doorways) become softly lit windows, so the houses read as lived-in.
  if (night >= TOWN_NIGHT && hsl.l < 0.18) { copy.emissive.copy(WINDOW_GLOW); copy.emissiveIntensity = 0.5; }
  byNight.set(night, copy);
  return copy;
}

/** Every `scenery` marker in `editor.scene.json`, resolved to its model file and ground lift once. */
const PLACEMENTS: readonly SceneryPlacement[] = editorLayers.markers.flatMap((marker) => {
  if (marker.kind !== "scenery") return [];
  const assetId = marker.meta?.["assetId"];
  if (typeof assetId !== "string") return [];
  const ref = assets.resolve(assetId);
  if (ref === null) return [];
  const scaleMeta = marker.meta?.["scale"];
  const scale = typeof scaleMeta === "number" ? scaleMeta : 1;
  const night = assetId.includes("buildings") ? TOWN_NIGHT : PLANT_NIGHT;
  return [{ id: marker.id, url: ref.url, x: marker.position.x, y: marker.position.y, z: marker.position.z, yaw: marker.rotationY ?? 0, scale, lift: -(ref.dims?.minY ?? 0) * scale, night }];
});

const gltfLoader = new GLTFLoader();

function sceneryPieceDraw(placement: SceneryPlacement): EngineDraw {
  return loadDraw({
    key: `gltf:${placement.url}`,
    load: () => gltfLoader.loadAsync(placement.url),
    build: (gltf, parent) => {
      const copy: Object3D = gltf.scene.clone(true);
      copy.traverse((node) => {
        node.castShadow = true;
        node.receiveShadow = true;
        if (node instanceof Mesh) node.material = nightMaterial(node.material, placement.night);
      });
      copy.position.set(placement.x, placement.y + placement.lift, placement.z);
      copy.rotation.set(0, placement.yaw, 0);
      copy.scale.setScalar(placement.scale);
      parent.add(copy);
    },
  });
}

/** The town behind the fence and the toadstools and wispy grass along the promenade: placed in the scene, drawn here, graded into the night. */
export function authoredSceneryDraw(): EngineDraw {
  const draws = PLACEMENTS.map(sceneryPieceDraw);
  return {
    mount(state) {
      for (const draw of draws) draw.mount?.(state);
    },
    frame(state) {
      for (const draw of draws) draw.frame?.(state, state.delta);
    },
    dispose(state) {
      for (const draw of draws) draw.dispose?.(state);
    },
  };
}

export function AuthoredScenery() {
  useEngineDraw(() => authoredSceneryDraw(), []);
  return null;
}
