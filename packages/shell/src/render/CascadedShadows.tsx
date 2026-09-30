import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { CSM } from "three/examples/jsm/csm/CSM.js";

import type { DirectionalLightingConfig } from "@jgengine/core/game/playableGame";

function isStandardMaterial(mat: THREE.Material): mat is THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial {
  return mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial;
}

/**
 * Cascaded shadow maps for one directional light — outdoor scenes keep shadows past a
 * single 40-unit ortho frustum. Uses three.js `CSM` (shader injection on standard materials).
 *
 * Mount when `entry.cascades > 1` and `castShadow`. Replaces the single R3F directional
 * shadow light for that entry.
 *
 * @internal shell SceneLighting helper — games set `cascades` on directional lighting config.
 */
export function CascadedShadows({ entry }: { entry: DirectionalLightingConfig }): null {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const csmRef = useRef<CSM | null>(null);

  useEffect(() => {
    const cascades = Math.max(2, Math.min(4, Math.floor(entry.cascades ?? 3)));
    const lightDirection = new THREE.Vector3(
      -entry.position[0],
      -entry.position[1],
      -entry.position[2],
    );
    if (lightDirection.lengthSq() < 1e-8) lightDirection.set(-1, -1, -1);
    lightDirection.normalize();

    const csm = new CSM({
      camera,
      parent: scene,
      cascades,
      maxFar: entry.shadowMaxFar ?? 200,
      mode: "practical",
      shadowMapSize: entry.shadowMapSize ?? 1024,
      shadowBias: entry.shadowBias ?? -0.0004,
      lightDirection,
      lightIntensity: entry.intensity ?? 1.3,
      lightNear: 0.5,
      lightFar: Math.max(200, (entry.shadowCameraSize ?? 40) * 6),
      lightMargin: entry.shadowCameraSize ?? 40,
    });
    for (const light of csm.lights) {
      light.color = new THREE.Color(entry.color ?? "#ffffff");
      light.castShadow = true;
    }
    const unbind = bindCsmMaterials(scene, csm);
    csmRef.current = csm;
    return () => {
      unbind();
      releaseCascadedShadows(csm);
      csmRef.current = null;
    };
  }, [
    camera,
    scene,
    entry.cascades,
    entry.color,
    entry.intensity,
    entry.position[0],
    entry.position[1],
    entry.position[2],
    entry.shadowBias,
    entry.shadowCameraSize,
    entry.shadowMapSize,
    entry.shadowMaxFar,
  ]);

  useFrame(() => {
    const csm = csmRef.current;
    if (csm === null) return;
    csm.camera = camera;
    csm.update();
  });

  return null;
}

/** Structural slice of CSM so the patcher is testable without a renderer. */
export interface CsmMaterialSetup {
  setupMaterial(material: THREE.Material): void;
  shaders?: Map<unknown, unknown>;
}

/** Release the lights and GPU targets that three.js CSM.dispose does not own. @internal */
export function releaseCascadedShadows(csm: Pick<CSM, "remove" | "dispose" | "lights">): void {
  csm.remove();
  for (const light of csm.lights) light.shadow.dispose();
  csm.dispose();
}

function setupMaterial(material: THREE.Material, csm: CsmMaterialSetup): void {
  const prior = material.onBeforeCompile;
  csm.setupMaterial(material);
  const csmHook = material.onBeforeCompile;
  if (prior !== THREE.Material.prototype.onBeforeCompile && prior !== csmHook) {
    material.onBeforeCompile = function (shader, renderer) {
      prior.call(this, shader, renderer);
      csmHook.call(this, shader, renderer);
    };
  }
  material.needsUpdate = true;
}

/** Patch streamed meshes on attachment and material replacement without scanning the world each frame. @internal */
export function bindCsmMaterials(scene: THREE.Scene, csm: CsmMaterialSetup): () => void {
  const nodes = new Map<THREE.Object3D, () => void>();
  const materials = new Map<THREE.Material, () => void>();
  const patch = (material: THREE.Material) => {
    if (!isStandardMaterial(material) || materials.has(material)) return;
    const prior = material.onBeforeCompile;
    const priorDefines = { ...material.defines };
    setupMaterial(material, csm);
    const hook = material.onBeforeCompile;
    const release = () => {
      material.removeEventListener("dispose", release);
      csm.shaders?.delete(material);
      if (material.onBeforeCompile === hook) material.onBeforeCompile = prior;
      for (const key of ["USE_CSM", "CSM_CASCADES", "CSM_FADE"]) {
        if (key in priorDefines) (material.defines ??= {})[key] = priorDefines[key];
        else if (material.defines !== undefined) delete material.defines[key];
      }
      material.needsUpdate = true;
      materials.delete(material);
    };
    materials.set(material, release);
    material.addEventListener("dispose", release);
  };
  const patchMesh = (node: THREE.Object3D) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) mesh.material.forEach(patch);
    else patch(mesh.material);
  };
  const detach = (node: THREE.Object3D) => {
    nodes.get(node)?.();
    nodes.delete(node);
    for (const child of node.children) detach(child);
  };
  const attach = (node: THREE.Object3D) => {
    if (nodes.has(node)) return;
    patchMesh(node);
    const added = ({ child }: THREE.Object3DEventMap["childadded"]) => attach(child);
    const removed = ({ child }: THREE.Object3DEventMap["childremoved"]) => detach(child);
    const prior = node.onBeforeRender;
    const before: typeof prior = function (this: THREE.Object3D, ...args) {
      prior.apply(this, args);
      patchMesh(this);
    };
    node.addEventListener("childadded", added);
    node.addEventListener("childremoved", removed);
    if ((node as THREE.Mesh).isMesh) node.onBeforeRender = before;
    nodes.set(node, () => {
      node.removeEventListener("childadded", added);
      node.removeEventListener("childremoved", removed);
      if (node.onBeforeRender === before) node.onBeforeRender = prior;
    });
    for (const child of node.children) attach(child);
  };
  attach(scene);
  return () => {
    detach(scene);
    for (const release of materials.values()) release();
  };
}

/**
 * Run CSM's `setupMaterial` over every unpatched standard material in the scene,
 * chaining rather than clobbering a material's own `onBeforeCompile`.
 */
export function patchSceneMaterials(
  scene: THREE.Scene,
  csm: CsmMaterialSetup,
  patched: WeakSet<THREE.Material>,
): void {
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      if (!isStandardMaterial(mat) || patched.has(mat)) continue;
      setupMaterial(mat, csm);
      patched.add(mat);
    }
  });
}
