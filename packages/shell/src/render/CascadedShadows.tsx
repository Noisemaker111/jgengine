import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { CSM } from "three/examples/jsm/csm/CSM.js";

import type { DirectionalLightingConfig } from "@jgengine/core/game/playableGame";
import type { GraphicsProfile } from "@jgengine/core/settings/graphicsProfile";
import { resolveCascadeCount, resolveShadowMapSize } from "./shadowTiers";
import type { DaylightModulation } from "./SceneLighting";

/** @internal Default PCF penumbra in shadow-map texels for configured directional lights. */
export const DEFAULT_SHADOW_RADIUS = 1.25;

/** @internal Reach in metres used when neither the game nor a graphics profile sets one. */
export const DEFAULT_SHADOW_DISTANCE = 200;

/**
 * Shadow reach each tier's map resolution pays for. A cascade's texels stop describing a
 * silhouette past roughly a tenth of a metre, so a smaller map covers less ground instead
 * of covering the same ground coarsely.
 * @internal
 */
export const SHADOW_DISTANCE_BY_MAP_SIZE: Readonly<Record<number, number>> = {
  512: 100,
  1024: 150,
  2048: 200,
  4096: 200,
};

/**
 * Cascaded-shadow reach from the graphics tier, clamped by that tier's draw distance.
 * A game's own `shadowMaxFar` still wins.
 * @internal
 */
export function resolveShadowDistance(profile?: GraphicsProfile, authored?: number): number {
  if (authored !== undefined) return authored;
  if (profile === undefined) return DEFAULT_SHADOW_DISTANCE;
  const reach = SHADOW_DISTANCE_BY_MAP_SIZE[profile.shadowMapSize] ?? DEFAULT_SHADOW_DISTANCE;
  return Math.min(profile.drawDistance, reach);
}

/**
 * Frames between shadow-map refreshes for the cascade at `index`, nearest first.
 * @deprecated Cascades refresh on a texel step; see {@link refreshCascadesOnTexelStep}.
 * @internal
 */
export function cascadeShadowCadence(index: number, cascades: number): number {
  if (index < cascades - 2) return 1;
  if (cascades <= 2) return index === 0 ? 1 : 2;
  return 2 ** (index - (cascades - 3));
}

/** Depth-axis steps worth of a texel the snapped light may drift before it re-anchors. */
export const CASCADE_DEPTH_STEP_TEXELS = 8;

const UP = new THREE.Vector3(0, 1, 0);
const orientMatrix = new THREE.Matrix4();
const inverseOrient = new THREE.Matrix4();
const localCentre = new THREE.Vector3();

/** World size of one texel on a cascade's own shadow map. @internal */
export function cascadeTexelSize(light: THREE.DirectionalLight): number {
  const shadowCamera = light.shadow.camera as THREE.OrthographicCamera;
  const span = Math.max(shadowCamera.right - shadowCamera.left, shadowCamera.top - shadowCamera.bottom);
  return span / Math.max(1, light.shadow.mapSize.x);
}

/**
 * The cascade centre rounded to whole texels of its own shadow map, in the light's orientation.
 * Lateral texels are what the eye sees move; the depth axis is coarser because it only shifts the
 * ortho depth window. @internal
 */
export function snapCascadeCenter(
  center: THREE.Vector3,
  lightDirection: THREE.Vector3,
  texelSize: number,
  depthTexels = CASCADE_DEPTH_STEP_TEXELS,
): THREE.Vector3 {
  const texel = texelSize > 0 ? texelSize : 1;
  orientMatrix.lookAt(new THREE.Vector3(), lightDirection, UP);
  inverseOrient.copy(orientMatrix).invert();
  localCentre.copy(center).applyMatrix4(inverseOrient);
  localCentre.x = Math.round(localCentre.x / texel) * texel;
  localCentre.y = Math.round(localCentre.y / texel) * texel;
  const depth = texel * Math.max(1, Math.floor(depthTexels));
  localCentre.z = Math.round(localCentre.z / depth) * depth;
  return localCentre.applyMatrix4(orientMatrix);
}

/** Per-frame cascade refresh bookkeeping: the centre each map was last rendered with. */
export interface CascadeRefreshState {
  centres: THREE.Vector3[];
  /** Depth passes requested since the state was created. */
  refreshes: number;
  /** Leading cascades that refresh every frame whatever the snap says: a moving caster must not freeze. */
  floor: number;
}

/** @internal */
export function createCascadeRefreshState(floor = 1): CascadeRefreshState {
  return { centres: [], refreshes: 0, floor };
}

/**
 * Pin each cascade's light to its texel grid and request a depth pass where that grid step moved
 * the light, plus every frame for the `floor` nearest cascades. `floor: 1` keeps the cascade holding
 * the player live so a walking actor's shadow follows it while the camera stands still; the far
 * cascades skip until the camera crosses a texel. An unmoved light keeps `autoUpdate` off, so the
 * map and the sampling matrix always stay the pair they were rendered as.
 * @internal
 */
export function refreshCascadesOnTexelStep(
  lights: readonly THREE.DirectionalLight[],
  lightDirection: THREE.Vector3,
  state: CascadeRefreshState,
): number {
  let refreshed = 0;
  for (let index = 0; index < lights.length; index += 1) {
    const light = lights[index]!;
    const snapped = snapCascadeCenter(light.position, lightDirection, cascadeTexelSize(light));
    const known = state.centres[index];
    const moved = known === undefined || known.distanceToSquared(snapped) > 1e-12;
    const refresh = moved || index < state.floor;
    light.position.copy(snapped);
    light.target.position.copy(snapped).add(lightDirection);
    light.shadow.autoUpdate = refresh;
    light.shadow.needsUpdate = false;
    if (moved) {
      if (known === undefined) state.centres[index] = snapped.clone();
      else known.copy(snapped);
    }
    if (refresh) {
      refreshed += 1;
      state.refreshes += 1;
    }
  }
  return refreshed;
}

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
export function CascadedShadows({
  entry,
  profile,
  modulation,
}: {
  entry: DirectionalLightingConfig;
  profile?: GraphicsProfile;
  modulation?: DaylightModulation;
}): null {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const csmRef = useRef<CSM | null>(null);
  const lightDirectionRef = useRef(new THREE.Vector3());
  const refreshRef = useRef<CascadeRefreshState>(createCascadeRefreshState());
  const baseIntensity = entry.intensity ?? 1.3;
  const maxFar = resolveShadowDistance(profile, entry.shadowMaxFar);
  const shadowMapSize = resolveShadowMapSize(profile, entry.shadowMapSize);
  const cascades = Math.max(2, Math.min(4, Math.floor(resolveCascadeCount(profile, entry.cascades))));

  useEffect(() => {
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
      maxFar,
      mode: "practical",
      shadowMapSize,
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
      light.shadow.radius = entry.shadowRadius ?? DEFAULT_SHADOW_RADIUS;
    }
    const unbind = bindCsmMaterials(scene, csm);
    csmRef.current = csm;
    lightDirectionRef.current.copy(lightDirection);
    refreshRef.current = createCascadeRefreshState();
    return () => {
      unbind();
      releaseCascadedShadows(csm);
      csmRef.current = null;
    };
  }, [
    camera,
    scene,
    cascades,
    entry.color,
    entry.intensity,
    entry.position[0],
    entry.position[1],
    entry.position[2],
    entry.shadowBias,
    entry.shadowCameraSize,
    shadowMapSize,
    maxFar,
    entry.shadowRadius,
  ]);

  useFrame(() => {
    const csm = csmRef.current;
    if (csm === null) return;
    if (modulation !== undefined) {
      // Mutated in place: changing `entry.intensity` would rebuild every cascade's shadow map.
      for (const light of csm.lights) {
        light.intensity = baseIntensity * modulation.sunFactor;
        light.color.set(modulation.sunColor);
      }
    }
    csm.camera = camera;
    csm.update();
    refreshCascadesOnTexelStep(csm.lights, lightDirectionRef.current, refreshRef.current);
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
    // One reference compare per draw: a mesh whose material has not been swapped costs nothing
    // more than the authored hook. Re-patching only on a change keeps the swap detection.
    let lastMaterial: THREE.Material | THREE.Material[] | undefined;
    const mesh = node as THREE.Mesh;
    const before: typeof prior = function (this: THREE.Object3D, ...args) {
      prior.apply(this, args);
      if (mesh.material === lastMaterial) return;
      lastMaterial = mesh.material;
      patchMesh(mesh);
    };
    node.addEventListener("childadded", added);
    node.addEventListener("childremoved", removed);
    if (mesh.isMesh) {
      lastMaterial = mesh.material;
      node.onBeforeRender = before;
    }
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
