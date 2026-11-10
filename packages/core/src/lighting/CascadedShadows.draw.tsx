/** @jsxImportSource @jgengine/core/ui/jsx */
// @skill jgengine-world
import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";
import { CSM } from "three/examples/jsm/csm/CSM.js";

import type { DirectionalLightingConfig } from "@jgengine/core/game/playableGame";
import type { GraphicsProfile } from "@jgengine/core/settings/graphicsProfile";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import { prepareBeforeWarmup } from "@jgengine/core/render/shaderWarmup.draw";
import { DEFAULT_SHADOW_RADIUS, lightShadowFilter, type ShadowFilter } from "./softShadows";
import { resolveCascadeCount, resolveShadowMapSize } from "./shadowTiers";
import type { DaylightModulation } from "./SceneLighting.draw";
import { recordCompileLayer } from "@jgengine/core/material/compileLayers.draw";

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
 * Texels of drift a cascade's centre holds still on every axis. The static shadow cache only
 * reuses a map while its projection repeats, so the centre re-anchors once per this many texels
 * of camera travel instead of once per texel: near cascades hold ~1-2 m, far ones several
 * metres. The re-anchor still lands on the texel grid, so each jump shifts the depth image by
 * whole texels and only the coverage edge moves.
 * @internal
 */
export const CASCADE_STEP_TEXELS = 48;

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
 * The cascade centre rounded to {@link CASCADE_STEP_TEXELS} texels of its own shadow map, in the
 * light's orientation, on every axis: the depth axis only shifts the ortho depth window, which is
 * hundreds of metres deep, so it holds as still as the image plane.
 * @internal
 */
export function snapCascadeCenter(
  center: THREE.Vector3,
  lightDirection: THREE.Vector3,
  texelSize: number,
  stepTexels = CASCADE_STEP_TEXELS,
): THREE.Vector3 {
  const texel = texelSize > 0 ? texelSize : 1;
  const step = texel * Math.max(1, Math.floor(stepTexels));
  orientMatrix.lookAt(new THREE.Vector3(), lightDirection, UP);
  inverseOrient.copy(orientMatrix).invert();
  localCentre.copy(center).applyMatrix4(inverseOrient);
  localCentre.x = Math.round(localCentre.x / step) * step;
  localCentre.y = Math.round(localCentre.y / step) * step;
  localCentre.z = Math.round(localCentre.z / step) * step;
  return localCentre.applyMatrix4(orientMatrix);
}

/** Per-frame cascade refresh bookkeeping: the centre each map was last rendered with. */
export interface CascadeRefreshState {
  centres: THREE.Vector3[];
  /** Depth passes requested since the state was created. */
  refreshes: number;
  /** Leading cascades that refresh every frame whatever the snap says: a moving caster must not freeze. */
  floor: number;
  /** Frames each cascade has waited with a moved light, so the longest wait goes first. */
  waiting: number[];
}

/** @internal */
export function createCascadeRefreshState(floor = 1): CascadeRefreshState {
  return { centres: [], refreshes: 0, floor, waiting: [] };
}

const snappedScratch: THREE.Vector3[] = [];

/**
 * Hold each cascade's light at the centre its map was drawn from until CSM's ideal centre drifts
 * {@link CASCADE_STEP_TEXELS} texels away, then re-anchor it on the texel grid, and request a
 * depth pass for the `floor` nearest cascades every frame plus one far cascade per frame, the
 * longest waiting first. `floor: 1` keeps the cascade holding the player live so a walking
 * actor's shadow follows it while the camera stands still; the far cascades skip until the
 * camera drifts a step. A light that does not redraw keeps `autoUpdate` off at the centre it was
 * drawn from, so the map and the sampling matrix always stay the pair they were rendered as.
 * @internal
 */
export function refreshCascadesOnTexelStep(
  lights: readonly THREE.DirectionalLight[],
  lightDirection: THREE.Vector3,
  state: CascadeRefreshState,
): number {
  // The far cascade whose centre has drifted longest gets this frame's one far redraw.
  let farPick = -1;
  for (let index = 0; index < lights.length; index += 1) {
    const light = lights[index]!;
    const known = state.centres[index];
    if (!driftedFromDrawn(light, known)) continue;
    if (index < state.floor || mustRedraw(light, known)) continue;
    state.waiting[index] = (state.waiting[index] ?? 0) + 1;
    if (farPick < 0 || state.waiting[index]! > state.waiting[farPick]!) farPick = index;
  }

  let refreshed = 0;
  for (let index = 0; index < lights.length; index += 1) {
    const light = lights[index]!;
    const known = state.centres[index];
    const texel = cascadeTexelSize(light);
    const snapped = (snappedScratch[index] ??= new THREE.Vector3());
    snapped.copy(snapCascadeCenter(light.position, lightDirection, texel));
    // A camera with no valid projection yet (a canvas measured at zero size: aspect 0) puts CSM's
    // lights at NaN. Nothing is drawn from such a centre and none is kept, so the first valid frame
    // redraws every cascade; a NaN once stored never compared as moved, and froze the far cascades
    // (and the shadow cache's pass keys) at NaN for the whole session.
    if (!isFiniteVector(snapped)) {
      if (known !== undefined) {
        light.position.copy(known);
        light.target.position.copy(known).add(lightDirection);
      }
      light.shadow.autoUpdate = false;
      light.shadow.needsUpdate = false;
      continue;
    }
    const drifted = driftedFromDrawn(light, known);
    const refresh = index < state.floor || mustRedraw(light, known) || (drifted && index === farPick);
    // A held light stays at the centre its map was drawn from; the light only moves on a frame
    // that also redraws, so the map and the sampling matrix stay the pair they were rendered as.
    const centre = (refresh && drifted) || known === undefined ? snapped : known;
    light.position.copy(centre);
    light.target.position.copy(centre).add(lightDirection);
    light.shadow.autoUpdate = refresh;
    light.shadow.needsUpdate = false;
    if (refresh) {
      if (known === undefined) state.centres[index] = centre.clone();
      else known.copy(centre);
      state.waiting[index] = 0;
      refreshed += 1;
      state.refreshes += 1;
    }
  }
  return refreshed;
}

/**
 * Whether CSM's ideal centre (`light.position`, set by `csm.update()` this frame) sits more than
 * {@link CASCADE_STEP_TEXELS} texels from the centre the cascade's map was drawn from. Hysteresis,
 * not a re-snap every frame: an ideal centre hovering on a grid line would otherwise flip the
 * light — and the shadow cache's pass key — back and forth each frame.
 */
function driftedFromDrawn(light: THREE.DirectionalLight, known: THREE.Vector3 | undefined): boolean {
  if (known === undefined || !isFiniteVector(known) || !isFiniteVector(light.position)) return false;
  const hold = cascadeTexelSize(light) * CASCADE_STEP_TEXELS;
  return light.position.distanceTo(known) > hold;
}

/**
 * A cascade whose map was never drawn has nothing to keep: three only creates the map in a depth
 * pass, and a frame whose draw was held (the shader warmup holds draws behind the loading cover)
 * runs the refresh without one. A map drawn outside a frame (the warmup's) asks for a redraw too.
 * Kept off then, the lit pass samples an empty colour texture through a shadow sampler, every draw
 * fails, and the scene comes up blank.
 */
function mustRedraw(light: THREE.DirectionalLight, known: THREE.Vector3 | undefined): boolean {
  return known === undefined || !isFiniteVector(known) || light.shadow.map === null || light.shadow.needsUpdate;
}

function isFiniteVector(v: THREE.Vector3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function isStandardMaterial(mat: THREE.Material): mat is THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial {
  return mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial;
}

/**
 * Draw-side form of {@link CascadedShadows}: the CSM is built on mount and rebuilt when the
 * resolved cascade inputs change; per frame it applies daylight modulation, refreshes cascade
 * centres on the texel grid and retunes soft-shadow filters.
 * @internal
 */
export function cascadedShadowsDraw(getProps: () => {
  entry: DirectionalLightingConfig;
  profile?: GraphicsProfile | undefined;
  modulation?: DaylightModulation | undefined;
}): EngineDraw {
  let csm: CSM | null = null;
  let unbind: (() => void) | null = null;
  const lightDirection = new THREE.Vector3();
  let refresh = createCascadeRefreshState();
  let baseNormalBias = 0;
  let appliedKey = "";

  const resolvedScalars = (props: ReturnType<typeof getProps>) => {
    const entry = props.entry;
    return {
      cascades: Math.max(2, Math.min(4, Math.floor(resolveCascadeCount(props.profile, entry.cascades)))),
      maxFar: resolveShadowDistance(props.profile, entry.shadowMaxFar),
      shadowMapSize: resolveShadowMapSize(props.profile, entry.shadowMapSize),
      softShadows: entry.lightSize !== undefined && props.profile?.softShadows === true,
    };
  };

  const build = (state: EngineFrameState) => {
    const props = getProps();
    const entry = props.entry;
    const scalars = resolvedScalars(props);
    const key = JSON.stringify([
      scalars.cascades, scalars.maxFar, scalars.shadowMapSize, scalars.softShadows,
      entry.color, entry.intensity, entry.position, entry.shadowBias, entry.shadowCameraSize,
      entry.shadowRadius,
    ]);
    if (key === appliedKey && csm !== null) return;
    appliedKey = key;
    teardown();
    const scene = state.rootScene ?? state.scene;
    lightDirection.set(-entry.position[0], -entry.position[1], -entry.position[2]);
    if (lightDirection.lengthSq() < 1e-8) lightDirection.set(-1, -1, -1);
    lightDirection.normalize();

    const baseIntensity = entry.intensity ?? 1.3;
    csm = new CSM({
      camera: state.camera,
      parent: scene,
      cascades: scalars.cascades,
      maxFar: scalars.maxFar,
      mode: "practical",
      shadowMapSize: scalars.shadowMapSize,
      shadowBias: entry.shadowBias ?? -0.0004,
      lightDirection,
      lightIntensity: baseIntensity,
      lightNear: 0.5,
      lightFar: Math.max(200, (entry.shadowCameraSize ?? 40) * 6),
      lightMargin: entry.shadowCameraSize ?? 40,
    });
    for (const light of csm.lights) {
      light.color = new THREE.Color(entry.color ?? "#ffffff");
      light.castShadow = true;
      light.shadow.radius = entry.shadowRadius ?? DEFAULT_SHADOW_RADIUS;
    }
    baseNormalBias = csm.lights[0]?.shadow.normalBias ?? 0;
    unbind = bindCsmMaterials(scene, csm);
    refresh = createCascadeRefreshState();
  };

  const teardown = () => {
    unbind?.();
    unbind = null;
    if (csm !== null) {
      releaseCascadedShadows(csm);
      csm = null;
    }
    appliedKey = "";
  };

  return {
    mount(state: EngineFrameState) {
      build(state);
    },
    update(state: EngineFrameState) {
      build(state);
    },
    frame(state: EngineFrameState) {
      const active = csm;
      if (active === null) return;
      const props = getProps();
      const entry = props.entry;
      const baseIntensity = entry.intensity ?? 1.3;
      const modulation = props.modulation;
      if (modulation !== undefined) {
        // Mutated in place: changing `entry.intensity` would rebuild every cascade's shadow map.
        for (const light of active.lights) {
          light.intensity = baseIntensity * modulation.sunFactor;
          light.color.set(modulation.sunColor);
        }
      }
      active.camera = state.camera;
      active.update();
      refreshCascadesOnTexelStep(active.lights, lightDirection, refresh);
      if (entry.lightSize !== undefined && props.profile?.softShadows === true) {
        const mapSize = resolveShadowMapSize(props.profile, entry.shadowMapSize);
        for (const light of active.lights) {
          const filter = cascadeShadowFilter(entry, props.profile, light.shadow.camera, mapSize, baseNormalBias);
          light.shadow.radius = filter.radius;
          light.shadow.normalBias = filter.normalBias;
        }
      }
    },
    dispose() {
      teardown();
    },
  };
}

/**
 * Cascaded shadow maps for one directional light — outdoor scenes keep shadows past a
 * single 40-unit ortho frustum. Uses three.js `CSM` (shader injection on standard materials).
 *
 * Mount when `entry.cascades > 1` and `castShadow`. Replaces the single directional
 * shadow light for that entry.
 *
 * @internal shell SceneLighting helper — games set `cascades` on directional lighting config.
 */
export function CascadedShadows(props: {
  entry: DirectionalLightingConfig;
  profile?: GraphicsProfile | undefined;
  modulation?: DaylightModulation | undefined;
}) {
  const latest = useRef(props);
  latest.current = props;
  return <EngineDrawMount create={() => cascadedShadowsDraw(() => latest.current)} deps={[]} />;
}

/**
 * One cascade's filter: the light's soft penumbra in that cascade's own texels, so the near cascade
 * widens to the physical penumbra and a coarse far one keeps its base filter. @internal
 */
export function cascadeShadowFilter(
  entry: DirectionalLightingConfig,
  profile: GraphicsProfile | undefined,
  camera: Pick<THREE.OrthographicCamera, "left" | "right">,
  mapSize: number,
  baseNormalBias: number,
): ShadowFilter {
  return lightShadowFilter(entry, profile, Math.abs(camera.right - camera.left), mapSize, baseNormalBias);
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

const CSM_DEFINES = ["USE_CSM", "CSM_CASCADES", "CSM_FADE"];

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
  recordCompileLayer(material, { hook: prior }, { defines: CSM_DEFINES });
  material.needsUpdate = true;
}

/** Patch streamed meshes on attachment and material replacement without scanning the world each frame. @internal */
export function bindCsmMaterials(scene: THREE.Scene, csm: CsmMaterialSetup): () => void {
  const nodes = new Map<THREE.Object3D, () => void>();
  /** Per mesh: patch again if its material was swapped since the last look. */
  const swapChecks = new Set<() => void>();
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
      for (const key of CSM_DEFINES) {
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
    const checkSwap = () => {
      if (mesh.material === lastMaterial) return;
      lastMaterial = mesh.material;
      patchMesh(mesh);
    };
    const before: typeof prior = function (this: THREE.Object3D, ...args) {
      prior.apply(this, args);
      checkSwap();
    };
    node.addEventListener("childadded", added);
    node.addEventListener("childremoved", removed);
    if (mesh.isMesh) {
      lastMaterial = mesh.material;
      node.onBeforeRender = before;
      swapChecks.add(checkSwap);
    }
    nodes.set(node, () => {
      node.removeEventListener("childadded", added);
      node.removeEventListener("childremoved", removed);
      if (node.onBeforeRender === before) node.onBeforeRender = prior;
      swapChecks.delete(checkSwap);
    });
    for (const child of node.children) attach(child);
  };
  attach(scene);
  // A swap is otherwise only seen at the mesh's first draw, which would link the patched program
  // on that frame; the shader warmup looks first, so it links the program the draw will use.
  const unprepare = prepareBeforeWarmup(scene, () => {
    for (const check of swapChecks) check();
  });
  return () => {
    unprepare();
    detach(scene);
    for (const release of materials.values()) release();
  };
}

/**
 * Run CSM's `setupMaterial` over every unpatched standard material in the scene,
 * chaining rather than clobbering a material's own `onBeforeCompile`.
 * @internal
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
