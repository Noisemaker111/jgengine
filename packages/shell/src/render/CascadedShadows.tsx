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
  const patchedRef = useRef(new WeakSet<THREE.Material>());
  const frameRef = useRef(0);

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
    patchedRef.current = new WeakSet();
    patchSceneMaterials(scene, csm, patchedRef.current);
    csmRef.current = csm;
    frameRef.current = 0;
    return () => {
      csm.dispose();
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
    frameRef.current += 1;
    // Async model mounts need setupMaterial — re-scan every 30 frames after the first.
    if (frameRef.current === 1 || frameRef.current % 30 === 0) {
      patchSceneMaterials(scene, csm, patchedRef.current);
    }
    csm.update();
  });

  return null;
}

function patchSceneMaterials(scene: THREE.Scene, csm: CSM, patched: WeakSet<THREE.Material>): void {
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      if (!isStandardMaterial(mat) || patched.has(mat)) continue;
      csm.setupMaterial(mat);
      patched.add(mat);
    }
  });
}
