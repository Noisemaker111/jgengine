import * as THREE from "three";

import type { EntitySpriteConfig, ModelConfig, ModelMaterialMaps, ModelPart } from "@jgengine/core/game/playableGame";
import type { GameContext } from "@jgengine/core/runtime/gameContextTypes";
import { parseModelHiddenNodes } from "@jgengine/core/editor/modelNodeVisibility";
import { createSpriteClipPlayer } from "@jgengine/core/render/sprite2d";
import { reportFallbackSeam, type FallbackSeam } from "@jgengine/core/devtools/fallbackSeams";
import { createModelVariantSelector } from "@jgengine/core/lod/modelLod";
import { idleOnlyAnimation } from "@jgengine/core/game/clipRoles";

import { detectKtx2Support, sharedGltfLoader } from "./modelLoad.draw";
import { measureLocalBounds, reportMeasuredBounds, type MeasuredLocalBounds } from "./measureBounds.draw";
import { recordRenderBounds } from "@jgengine/core/visibility/measuredBounds";
import { measureLocalCollisionTriangles, reportCollisionMeshOnce } from "./measureCollisionMesh.draw";
import { modelForLook } from "./modelLook";
import {
  applyMaterialAssignments,
  configureMaterialTexture,
  validateMaterialAssignmentTargets,
  MaterialTextureLoader,
} from "@jgengine/core/material/materialAsset.draw";
import type { MaterialOverrideTextures } from "@jgengine/core/material/materialOverride.draw";
import { MATERIAL_TEXTURE_SEMANTICS, type MaterialTextureMetadata, type MaterialTextureRole } from "@jgengine/core/material/materialAsset";
import { FootIkDriver } from "@jgengine/core/anim/useFootIk.draw";
import { GlanceDriver } from "@jgengine/core/anim/characterGlance.draw";
import { attachWornLayer } from "@jgengine/core/anim/wearable/wornLayers.draw";
import { resolveRigNode } from "./rigNode.draw";
import { drawCharacterMotion } from "@jgengine/core/anim/characterMotion.draw";
import { characterMotionKey, planCharacterMotion, type CharacterMotionPlan } from "@jgengine/core/anim/characterMotion";
import { registerMotionBlurBody } from "@jgengine/core/postfx/motionBlurPass.draw";
import { findMuzzleBone, registerEntityMuzzle } from "@jgengine/core/anim/entityMuzzle.draw";
import { registerEntityBody } from "@jgengine/core/anim/CorpseRagdolls.draw";
import { terrainQuality } from "@jgengine/core/terrain/terrainQuality.draw";
import { syncSpriteFrame } from "@jgengine/core/render/spriteRender.draw";
import { singleVariantLevel, variantLevelModel } from "@jgengine/core/lod/singleVariantLod.draw";
import { applyMaterialOverride } from "@jgengine/core/material/materialOverride.draw";
import { deathRemovesEntity } from "@jgengine/core/combat/death";
import {
  applyPaintTextureToMaterials,
  cacheStandardMaterials,
  cloneModelScene,
  createPaintCanvas,
  disposeModelScene,
  ownModelMaterial,
  disposePaintCanvas,
  syncPaintCanvas,
  modelPlacementTransform,
  type MaterialCache,
  type PaintCanvas,
} from "./modelRender.draw";
import { applyModelNodeVisibility } from "./modelNodeVisibility.draw";
import { addHumanoidSockets, firstPersonArms, withHumanoidActionClips } from "@jgengine/core/anim/humanoidActionClips.draw";
import { collapseHead, firstPersonBodyInstance, humanoidHead, keepHeadUnderEye } from "@jgengine/core/camera/firstPersonBody.draw";
import { applyModelWindToScene } from "./modelWind.draw";
import { registerCharacterRig, unregisterCharacterRig } from "@jgengine/core/lod/characterLod";
import { ModelAnimationDriver } from "@jgengine/core/anim/modelAnimationDriver.draw";
import { createPartPose, partMotionPhase, sampleBodyPose, samplePartPose, type PartMotionInput } from "@jgengine/core/game/partAnimation";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { childFrameState } from "@jgengine/core/frame/engineLoop.draw";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { resolveAssetBaseUrl } from "@jgengine/core/assets/assetBase";

/** Where a measured model reports its rendered bounds: an entity kind or an object catalog id. */
export interface MeasureTarget {
  target: "entity" | "object";
  key: string;
}

export interface EntityModelDrawOptions {
  model: ModelConfig;
  instanceId?: string | undefined;
  measure?: MeasureTarget | undefined;
  /** The variant level being drawn; past the source level a simplified asset may drop a slot. */
  lodLevel?: number;
  /** Live game context; null in previews and inspectors. */
  ctx: GameContext | null;
  /** Fallback-seam label for load/render failures (the measure target when present). */
  seam?: FallbackSeam | undefined;
  /** Drawn in place of the model when its load or build fails — the sprite fallback. */
  fallback?: (() => EngineDraw) | undefined;
}

/** A mounted child draw, its scene-graph parent, and the state scoped to it at mount. */
interface MountedChild {
  draw: EngineDraw;
  parent: THREE.Object3D;
  state: EngineFrameState;
}

/**
 * The children one model composition mounts: attachment and part draws, each
 * under its own parent (a rig bone or an offset group). Frames forward in
 * mount order; dispose tears every child down.
 */
class ModelChildren implements EngineDraw {
  readonly root = new THREE.Group();
  private readonly mounted: MountedChild[] = [];
  private state: EngineFrameState | null = null;

  mount(state: EngineFrameState): void {
    this.state = state;
    state.scene.add(this.root);
  }

  add(parent: THREE.Object3D, draw: EngineDraw): void {
    const state = this.state;
    if (state === null) throw new Error("ModelChildren.add before mount");
    const childState = childFrameState(state, parent);
    draw.mount?.(childState);
    this.mounted.push({ draw, parent, state: childState });
  }

  /** Dispose every child and drop their objects; the root group stays mounted. */
  clear(): void {
    for (const child of this.mounted.splice(0)) child.draw.dispose?.(child.state);
    this.root.clear();
  }

  frame(state: EngineFrameState): void {
    for (const child of this.mounted) child.draw.frame?.(childFrameState(state, child.parent), state.delta);
  }

  dispose(state: EngineFrameState): void {
    this.clear();
    state.scene.remove(this.root);
    this.state = null;
  }
}

// ---------------------------------------------------------------------------
// Async asset loading (the useLoader / useModelMaterialTextures replacements)

const gltfLoads = new Map<string, Promise<GLTF>>();
const textureLoads = new Map<string, Promise<THREE.Texture>>();

function loadGltf(url: string): Promise<GLTF> {
  let promise = gltfLoads.get(url);
  if (promise === undefined) {
    promise = sharedGltfLoader.loadAsync(url);
    gltfLoads.set(url, promise);
    promise.catch(() => gltfLoads.delete(url));
  }
  return promise;
}

/** Warm the shared per-url GLTF load entity draws use, so a streaming prepare finishes the parse off the frame. @internal */
export function preloadSceneModel(url: string): Promise<GLTF> {
  return loadGltf(url);
}

function loadMaterialTexture(url: string): Promise<THREE.Texture> {
  const resolved = resolveAssetBaseUrl(url);
  let promise = textureLoads.get(resolved);
  if (promise === undefined) {
    promise = new MaterialTextureLoader().loadAsync(resolved);
    textureLoads.set(resolved, promise);
    promise.catch(() => textureLoads.delete(resolved));
  }
  return promise;
}

export interface ModelTextureEntries {
  global: MaterialOverrideTextures;
  assets: ReadonlyMap<string, MaterialOverrideTextures>;
  dispose(): void;
}

function overrideMapEntries(maps: ModelMaterialMaps | undefined): { role: MaterialTextureRole; metadata: MaterialTextureMetadata }[] {
  const result: { role: MaterialTextureRole; metadata: MaterialTextureMetadata }[] = [];
  // type-escape: ModelMaterialMaps is a Partial record over a string union, so
  // Object.entries widens values past `string | undefined`.
  for (const [role, url] of Object.entries(maps ?? {}) as [string, string | undefined][]) {
    const semantic = MATERIAL_TEXTURE_SEMANTICS[role as MaterialTextureRole];
    if (url !== undefined && semantic !== undefined) {
      result.push({ role: role as MaterialTextureRole, metadata: { url, colorSpace: semantic.colorSpace } });
    }
  }
  return result;
}

/**
 * Load and own every map view one model configuration references — the
 * React-free equivalent of `useModelMaterialTextures`. Resolves once all
 * images arrive; `dispose` releases the owned views while the loaded sources
 * stay cached.
 */
export async function loadModelMaterialTextures(model: Pick<ModelConfig, "material" | "materialAssets" | "materialAssignments">): Promise<ModelTextureEntries> {
  const ids = new Set(model.materialAssignments?.map((assignment) => assignment.materialId));
  const referenced = (model.materialAssets ?? []).filter((asset) => ids.has(asset.id));
  const entries: { assetId?: string; role: MaterialTextureRole; metadata: MaterialTextureMetadata }[] = [
    ...overrideMapEntries(model.material?.maps),
  ];
  for (const asset of referenced) {
    for (const [role, metadata] of Object.entries(asset.textures ?? {})) {
      entries.push({ assetId: asset.id, role: role as MaterialTextureRole, metadata: metadata! });
    }
  }
  const loaded = await Promise.all(entries.map((entry) => loadMaterialTexture(entry.metadata.url)));
  const owned: THREE.Texture[] = [];
  try {
    const global: MaterialOverrideTextures = {};
    const assets = new Map<string, MaterialOverrideTextures>();
    entries.forEach((entry, index) => {
      const view = configureMaterialTexture(entry.role, entry.metadata, loaded[index]!);
      view.flipY = false;
      owned.push(view);
      if (entry.assetId === undefined) global[entry.role] = view;
      else {
        let textures = assets.get(entry.assetId);
        if (textures === undefined) {
          textures = {};
          assets.set(entry.assetId, textures);
        }
        textures[entry.role] = view;
      }
    });
    return {
      global,
      assets,
      dispose() {
        for (const texture of owned) texture.dispose();
        owned.length = 0;
      },
    };
  } catch (error) {
    for (const texture of owned) texture.dispose();
    throw error;
  }
}

// ---------------------------------------------------------------------------
// The placed instance: clone, configure, animate, pose

interface BuiltInstance {
  /** The placed group (position + uniform scale) added under the composition root. */
  group: THREE.Group;
  /** The unscaled content group the animation/IK drivers pose. */
  scene: THREE.Group;
  content: THREE.Object3D;
  scale: number;
  position: [number, number, number];
  /** Local bounds captured before the animation driver poses the rig — the bind pose reports. */
  bindBounds: MeasuredLocalBounds | null;
  animation: ModelAnimationDriver | null;
  head: THREE.Object3D | null;
  arms: (() => void) | null;
  bodyRest: THREE.Vector3;
  unregisterRig: (() => void) | null;
  offs: (() => void)[];
}

function countRig(root: THREE.Object3D): [parts: number, bones: number] {
  let parts = 0;
  let bones = 0;
  root.traverse((node) => {
    if ((node as THREE.SkinnedMesh).isSkinnedMesh === true) {
      parts += 1;
      bones = Math.max(bones, (node as THREE.SkinnedMesh).skeleton.bones.length);
    }
  });
  return [parts, bones];
}

interface InstanceSpec {
  model: ModelConfig;
  gltf: GLTF;
  instanceId?: string | undefined;
  configure?: ((content: THREE.Object3D) => void) | undefined;
  locomotion?: boolean | undefined;
  ctx: GameContext | null;
  invalidate?: (() => void) | undefined;
  /** Runs after placement, before the animation driver poses the rig — bind-pose measurement. */
  onBindPose?: ((scene: THREE.Object3D, scale: number, offset: readonly [number, number, number]) => void) | undefined;
}

/**
 * Clone, configure, place and bind the animation driver for one loaded model —
 * the React-free equivalent of `useModelInstance`'s build path.
 */
function buildInstance(spec: InstanceSpec, renderer: THREE.WebGLRenderer | null): BuiltInstance {
  const { model, gltf, instanceId, ctx } = spec;
  if (renderer !== null && (renderer as THREE.WebGLRenderer & { isWebGLRenderer?: boolean }).isWebGLRenderer) {
    detectKtx2Support(renderer);
  }
  const hiddenNodes = parseModelHiddenNodes(model.hiddenNodes);
  const humanoid = typeof model.animation === "object" && model.animation.humanoidActions === true;
  const content = cloneModelScene(gltf.scene, { shadows: model.shadows, surfaceDetail: model.surfaceDetail });
  try {
    spec.configure?.(content);
    addHumanoidSockets(content, gltf.scene, gltf.animations);
    applyModelWindToScene(content, model.wind, model.wind === false || model.wind === undefined ? 4 : model.wind.height ?? 4);
    for (const diagnostic of applyModelNodeVisibility(content, hiddenNodes)) console.warn(`Model ${model.url} hiddenNodes: ${diagnostic.message}`);
    const scene = new THREE.Group().add(content);
    const bindBounds = measureLocalBounds(scene);
    const placement = modelPlacementTransform(scene, model, bindBounds);
    const group = new THREE.Group();
    group.position.set(placement.position[0], placement.position[1], placement.position[2]);
    group.scale.setScalar(placement.scale);
    group.add(scene);

    const built: BuiltInstance = {
      group,
      scene,
      content,
      scale: placement.scale,
      position: placement.position,
      bindBounds,
      animation: null,
      head: null,
      arms: null,
      bodyRest: content.position.clone(),
      unregisterRig: null,
      offs: [],
    };

    if (instanceId !== undefined) {
      const [parts, bones] = countRig(content);
      if (parts > 0) {
        registerCharacterRig(instanceId, parts, bones);
        built.unregisterRig = () => unregisterCharacterRig(instanceId);
      }
    }

    spec.onBindPose?.(scene, placement.scale, placement.position);
    const clips = humanoid ? withHumanoidActionClips(gltf.scene, gltf.animations) : gltf.animations;
    const locomotion = spec.locomotion !== false;
    const idleOnly = locomotion ? undefined : idleOnlyAnimation(clips.map((clip) => clip.name));
    const animationInput = model.animation ?? (instanceId === undefined ? undefined : locomotion ? "auto" : idleOnly ?? "auto");
    built.animation = new ModelAnimationDriver({
      scene: content,
      clips,
      animationInput,
      instanceId,
      ctx,
      invalidate: spec.invalidate,
    });

    const firstPerson = instanceId !== undefined && firstPersonBodyInstance() === instanceId;
    built.head = firstPerson ? humanoidHead(content) : null;
    built.arms = firstPerson ? firstPersonArms(content, gltf.scene, gltf.animations) : null;
    return built;
  } catch (error) {
    disposeModelScene(content);
    throw error;
  }
}

function disposeInstance(built: BuiltInstance): void {
  for (const off of built.offs.splice(0)) off();
  built.unregisterRig?.();
  built.unregisterRig = null;
  built.animation?.dispose();
  built.animation = null;
  built.arms?.();
  built.arms = null;
  if (built.head !== null) {
    built.head.scale.setScalar(1);
    built.content.position.copy(built.bodyRest);
    built.head = null;
  }
  disposeModelScene(built.content);
}

// ---------------------------------------------------------------------------
// Procedural part motion (the PartMotionRig replacement)

const FLINCH_RELEASE_SEC = 0.35;
const DEATH_RAMP_PER_SEC = 2.5;
const SPEED_SMOOTHING = 12;

/**
 * Procedural motion for a rig-less part composition: bob/flinch/topple on the
 * root group, per-role swings on each tagged part group. Children mount their
 * content under `partGroup(index)` or, for the base model, the root itself.
 */
class PartMotionDraw implements EngineDraw {
  private readonly root = new THREE.Group();
  private readonly partGroups: { part: ModelPart; group: THREE.Group }[] = [];
  private readonly motion = { lastPos: null as [number, number, number] | null, speed: 0, flinch: 0, death: 0 };
  private readonly input: PartMotionInput;
  private readonly pose = createPartPose();
  private offs: (() => void)[] = [];

  constructor(
    parts: readonly ModelPart[],
    private readonly model: ModelConfig,
    private readonly instanceId: string | undefined,
    private readonly ctx: GameContext | null,
  ) {
    const phase = partMotionPhase(instanceId ?? model.url);
    this.input = { timeSec: 0, speed: 0, phase, flinch: 0, death: 0 };
    for (const part of parts) {
      const group = new THREE.Group();
      group.position.set(...(part.position ?? [0, 0, 0]));
      group.rotation.set(...(part.rotation ?? [0, 0, 0]));
      group.scale.setScalar(part.scale ?? 1);
      this.root.add(group);
      this.partGroups.push({ part, group });
    }
  }

  /** The group under the rig root (added to the composition root on mount). */
  get host(): THREE.Group {
    return this.root;
  }

  partGroup(index: number): THREE.Group | undefined {
    return this.partGroups[index]?.group;
  }

  mount(state: EngineFrameState): void {
    state.scene.add(this.root);
    if (this.ctx !== null && this.instanceId !== undefined) {
      this.offs.push(
        this.ctx.game.events.on("combat.hitReaction", (event) => {
          if (event.instanceId === this.instanceId) this.motion.flinch = 1;
        }),
        this.ctx.game.events.on("entity.died", (event) => {
          if (event.instanceId === this.instanceId) this.motion.death = Math.max(this.motion.death, 1e-6);
        }),
      );
    }
  }

  frame(state: EngineFrameState): void {
    const motion = this.motion;
    const delta = state.delta;
    if (delta > 0 && this.instanceId !== undefined && this.ctx !== null) {
      const entity = this.ctx.scene.entity.get(this.instanceId);
      if (entity !== null) {
        const [x, , z] = entity.position;
        if (motion.lastPos !== null) {
          const instantSpeed = Math.hypot(x - motion.lastPos[0], z - motion.lastPos[2]) / delta;
          motion.speed += (instantSpeed - motion.speed) * Math.min(1, delta * SPEED_SMOOTHING);
        }
        motion.lastPos = [x, entity.position[1], z];
      }
      motion.flinch = Math.max(0, motion.flinch - delta / FLINCH_RELEASE_SEC);
      if (motion.death > 0) motion.death = Math.min(1, motion.death + delta * DEATH_RAMP_PER_SEC);
    }

    const input = this.input;
    input.timeSec = state.clock.elapsedTime;
    input.speed = motion.speed;
    input.flinch = motion.flinch;
    input.death = motion.death;

    sampleBodyPose(input, this.model.partMotion, this.pose);
    this.root.position.set(this.pose.position[0], this.pose.position[1], this.pose.position[2]);
    this.root.rotation.set(this.pose.rotation[0], this.pose.rotation[1], this.pose.rotation[2]);
    this.root.scale.set(this.pose.scale[0], this.pose.scale[1], this.pose.scale[2]);
    for (const { part, group } of this.partGroups) {
      if (part.role === undefined) continue;
      samplePartPose(part.role, input, this.model.partMotion, this.pose);
      const base = part.position ?? [0, 0, 0];
      const baseRotation = part.rotation ?? [0, 0, 0];
      group.position.set(base[0] + this.pose.position[0], base[1] + this.pose.position[1], base[2] + this.pose.position[2]);
      group.rotation.set(baseRotation[0] + this.pose.rotation[0], baseRotation[1] + this.pose.rotation[1], baseRotation[2] + this.pose.rotation[2]);
      const baseScale = part.scale ?? 1;
      group.scale.set(baseScale * this.pose.scale[0], baseScale * this.pose.scale[1], baseScale * this.pose.scale[2]);
    }
  }

  dispose(state: EngineFrameState): void {
    for (const off of this.offs.splice(0)) off();
    state.scene.remove(this.root);
    this.root.clear();
  }
}

// ---------------------------------------------------------------------------
// Attachments

/**
 * A bone-anchored model attachment: loads its GLB, clones it, resolves the rig
 * slot and parents the clone to the bone. The clone leaves with the parent
 * model; dispose removes and frees it.
 */
function boneAttachmentDraw(spec: {
  rig: THREE.Object3D;
  model: ModelConfig;
  slot: string;
  position?: readonly [number, number, number] | undefined;
  rotation?: readonly [number, number, number] | undefined;
  scale?: number | undefined;
  seam?: FallbackSeam | undefined;
}): EngineDraw {
  const px = spec.position?.[0] ?? 0;
  const py = spec.position?.[1] ?? 0;
  const pz = spec.position?.[2] ?? 0;
  const rx = spec.rotation?.[0] ?? 0;
  const ry = spec.rotation?.[1] ?? 0;
  const rz = spec.rotation?.[2] ?? 0;
  const s = spec.scale ?? 1;
  const holder = new THREE.Group();
  holder.userData["jgAttachment"] = true;
  let clone: THREE.Object3D | null = null;
  let mounted = false;
  let resolvedNode: THREE.Object3D | null = null;
  return {
    mount() {
      const resolved = resolveRigNode(spec.rig, spec.slot);
      if (resolved.node === undefined) {
        if (typeof console !== "undefined") {
          console.warn(`[jgengine] entityModels attachment: ${resolved.diagnostic.message}`);
        }
        return;
      }
      resolvedNode = resolved.node;
      mounted = true;
      void loadGltf(spec.model.url).then((gltf) => {
        if (!mounted || resolvedNode === null) return;
        try {
          clone = cloneModelScene(gltf.scene);
        } catch (error) {
          reportFallbackSeam(spec.seam ?? "entity", "renderError");
          if (typeof console !== "undefined") {
            console.warn(`[jgengine] model "${spec.model.url}" attachment threw while rendering`, error);
          }
          return;
        }
        clone.position.set(px, py, pz);
        clone.rotation.set(rx, ry, rz);
        clone.scale.setScalar(s);
        resolvedNode.add(clone);
      });
    },
    dispose() {
      mounted = false;
      if (clone !== null) {
        clone.removeFromParent();
        disposeModelScene(clone);
        clone = null;
      }
      resolvedNode = null;
      holder.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// The full EntityModel draw

const ENGINE_MOTION_CAMERA_DISTANCE = 20;
const ENGINE_IK_OPTIONS = { quiet: true, maxCameraDistance: ENGINE_MOTION_CAMERA_DISTANCE } as const;
const MUZZLE_REACH_M = 0.28;

function motionSignature(plan: CharacterMotionPlan, locomotion: boolean, lowTier: boolean): string {
  const ik = plan.footIk === undefined ? "-" : plan.footIk === "auto" ? "auto" : JSON.stringify(plan.footIk);
  return `${ik}|${plan.glance ? 1 : 0}|${locomotion ? 1 : 0}|${lowTier ? 1 : 0}`;
}

/**
 * Draws an entity's model without React: loading, cloning, materials, paint,
 * attachments, parts, animation, foot IK, glance, bounds and collision
 * measurement — the `EntityModel` contract on the engine frame loop. A live
 * `instanceId` follows `look`, `held`, `worn`, `characterMotion` and death
 * through context notifications, rebuilding only what changed.
 */
export function entityModelDraw(options: EntityModelDrawOptions): EngineDraw {
  const { model, instanceId, measure, lodLevel = 0, ctx } = options;
  const seam = options.seam ?? measure?.target;
  const children = new ModelChildren();
  let built: BuiltInstance | null = null;
  /** The model the current build used (post-look resolution). */
  let activeModel: ModelConfig = model;
  let materialTextures: ModelTextureEntries | null = null;
  let mounted = false;
  let buildSeq = 0;
  let appearanceKey = "";
  let dead = false;
  let offCtx: (() => void) | null = null;
  let offDied: (() => void) | null = null;
  let motion = { footIk: null as FootIkDriver | null, glance: null as GlanceDriver | null, signature: "" };
  let paintCanvas: PaintCanvas | null = null;
  let paintDrawnCount = 0;
  let paintVersion = -1;
  let materialCache: MaterialCache | null = null;
  let wornUndos: (() => void)[] = [];
  let wornKey = "";
  let bodyOff: (() => void) | null = null;
  let blurOff: (() => void) | null = null;
  let partDraw: PartMotionDraw | null = null;
  let frameState: EngineFrameState | null = null;
  let fallbackShown = false;
  let lastTerrainQuality: string | null = null;

  function currentModel(): ModelConfig {
    if (ctx === null || instanceId === undefined || model.looks === undefined) return model;
    const look = ctx.scene.entity.get(instanceId)?.look;
    return modelForLook(model, typeof look === "string" ? look : undefined);
  }

  function computeAppearanceKey(): string {
    if (ctx === null || instanceId === undefined) return "";
    const entity = ctx.scene.entity.get(instanceId);
    const look = model.looks === undefined ? "" : String(entity?.look ?? "");
    const held = model.held === undefined ? "" : String(entity?.held ?? "");
    const worn = model.worn === undefined ? "" : (entity?.worn ?? []).join("\n");
    return `${look}${held}${worn}${characterMotionKey(entity?.characterMotion)}${dead ? "d" : ""}`;
  }

  function syncWornLayers(): void {
    if (built === null || activeModel.worn === undefined) return;
    const nextKey = ctx === null || instanceId === undefined ? "" : (ctx.scene.entity.get(instanceId)?.worn ?? []).join("\n");
    if (nextKey === wornKey) return;
    wornKey = nextKey;
    for (const undo of wornUndos.splice(0)) undo();
    if (nextKey === "") return;
    const layers = nextKey.split("\n").flatMap((itemId) => activeModel.worn![itemId] ?? []);
    if (layers.length === 0) return;
    wornUndos = layers.map((layer) => attachWornLayer(built!.scene, layer));
  }

  function teardownBuilt(): void {
    for (const undo of wornUndos.splice(0)) undo();
    wornUndos = [];
    wornKey = "";
    motion.footIk?.dispose();
    motion.glance?.dispose();
    motion = { footIk: null, glance: null, signature: "" };
    bodyOff?.();
    blurOff?.();
    bodyOff = null;
    blurOff = null;
    if (built !== null) {
      built.group.removeFromParent();
      disposeInstance(built);
      built = null;
    }
    if (paintCanvas !== null) {
      disposePaintCanvas(paintCanvas);
      paintCanvas = null;
    }
    paintDrawnCount = 0;
    paintVersion = -1;
    materialCache = null;
  }

  function syncMotionDrivers(): void {
    if (built === null) return;
    const liveModel = currentModel();
    const motionParts = drawCharacterMotion(liveModel.characterMotion, ctx, instanceId);
    const lowTier = terrainQuality() === "low";
    const plan = planCharacterMotion({
      live: instanceId !== undefined && ctx !== null,
      lowTier,
      dead,
      ik: liveModel.ik,
      authoredAnimation: liveModel.animation !== undefined,
      motion: motionParts,
    });
    const signature = motionSignature(plan, motionParts.locomotion, lowTier);
    if (signature === motion.signature) return;
    motion.footIk?.dispose();
    motion.glance?.dispose();
    const baseY = liveModel.y ?? 0;
    motion = {
      footIk: plan.footIk === undefined || ctx === null || instanceId === undefined
        ? null
        : new FootIkDriver({
            scene: built.scene,
            config: plan.footIk,
            ctx,
            instanceId,
            groundOffset: baseY,
            ...(plan.footIk === "auto" ? ENGINE_IK_OPTIONS : {}),
          }),
      glance: !plan.glance || ctx === null || instanceId === undefined
        ? null
        : new GlanceDriver({ scene: built.scene, enabled: true, ctx, instanceId, maxCameraDistance: ENGINE_MOTION_CAMERA_DISTANCE }),
      signature,
    };
  }

  function registerBodies(): void {
    bodyOff?.();
    blurOff?.();
    bodyOff = null;
    blurOff = null;
    if (built === null || instanceId === undefined) return;
    bodyOff = registerEntityBody(instanceId, built.scene);
    blurOff = registerMotionBlurBody(built.scene);
  }

  function buildChildren(liveModel: ModelConfig): void {
    if (built === null) return;
    const parts = liveModel.parts ?? [];
    const hasRoles = parts.some((part) => part.role !== undefined);
    partDraw = hasRoles ? new PartMotionDraw(parts, liveModel, instanceId, ctx) : null;
    if (partDraw !== null) {
      children.add(children.root, partDraw);
      // The base content joins the rig root so the whole composition moves.
      built.group.removeFromParent();
      partDraw.host.add(built.group);
    } else {
      children.root.add(built.group);
    }

    const heldTable = liveModel.held;
    const heldId = ctx === null || instanceId === undefined ? undefined : ctx.scene.entity.get(instanceId)?.held;
    const held = heldId === undefined ? undefined : heldTable?.[heldId];
    const attachments = held === undefined ? liveModel.attachments ?? [] : [...(liveModel.attachments ?? []), held];
    for (const attachment of attachments) {
      if (typeof attachment.model === "string") continue;
      children.add(built.scene, boneAttachmentDraw({
        rig: built.scene,
        model: attachment.model,
        slot: attachment.slot,
        position: attachment.position,
        rotation: attachment.rotation,
        scale: attachment.scale,
        seam,
      }));
    }

    for (const [index, part] of parts.entries()) {
      if (typeof part.model === "string") continue;
      let parent: THREE.Object3D;
      if (hasRoles) {
        parent = partDraw!.partGroup(index)!;
      } else {
        parent = new THREE.Group();
        parent.position.set(...(part.position ?? [0, 0, 0]));
        parent.rotation.set(...(part.rotation ?? [0, 0, 0]));
        parent.scale.setScalar(part.scale ?? 1);
        children.root.add(parent);
      }
      children.add(parent, entityModelDraw({ model: part.model, ctx, seam }));
    }
  }

  async function buildAll(): Promise<void> {
    const seq = ++buildSeq;
    const liveModel = currentModel();
    activeModel = liveModel;
    parseModelHiddenNodes(liveModel.hiddenNodes);
    const materialAssets = (liveModel.materialAssets ?? []).filter((asset) =>
      liveModel.materialAssignments?.some((assignment) => assignment.materialId === asset.id),
    );
    const unmatched = lodLevel > 0 ? "skip" as const : "throw" as const;
    const material = liveModel.material;
    // The GLB lands first so assignment preflight rejects before any material
    // texture view is allocated — the same order the Suspense version enforced.
    const gltf = await loadGltf(liveModel.url);
    if (!mounted || seq !== buildSeq) return;
    if (liveModel.materialAssignments !== undefined && liveModel.materialAssignments.length > 0) {
      validateMaterialAssignmentTargets(gltf.scene, materialAssets, liveModel.materialAssignments, {
        baseAlphaMode: material?.alphaMode,
        unmatched,
      });
    }
    const textures = await loadModelMaterialTextures(liveModel);
    if (!mounted || seq !== buildSeq) {
      textures.dispose();
      return;
    }
    materialTextures = textures;
    const configure = (content: THREE.Object3D) => {
      if (material !== undefined) {
        applyMaterialOverride(content, material, { clone: false, textures: textures.global, ownMaterial: (replacement) => ownModelMaterial(content, replacement) });
      }
      if (liveModel.materialAssignments !== undefined) {
        applyMaterialAssignments(content, materialAssets, liveModel.materialAssignments, textures.assets, { unmatched });
      }
    };

    const motionParts = drawCharacterMotion(liveModel.characterMotion, ctx, instanceId);
    const lowTier = terrainQuality() === "low";
    lastTerrainQuality = terrainQuality();
    const plan = planCharacterMotion({
      live: instanceId !== undefined && ctx !== null,
      lowTier,
      dead,
      ik: liveModel.ik,
      authoredAnimation: liveModel.animation !== undefined,
      motion: motionParts,
    });

    const measureTarget = measure?.target;
    const measureKey = measure?.key;
    const dimsMaxY = liveModel.dims?.maxY;
    const source = `${liveModel.url}|${liveModel.hiddenNodes ?? ""}`;
    built = buildInstance(
      {
        model: liveModel,
        gltf,
        instanceId,
        configure,
        locomotion: motionParts.locomotion,
        ctx,
        invalidate: () => frameState?.invalidate(),
        onBindPose: ctx === null || measureTarget === undefined || measureKey === undefined
          ? undefined
          : (bindScene, bindScale, bindOffset) => {
              const bindSource = `${source}|${bindScale}|${bindOffset.join(",")}`;
              reportCollisionMeshOnce(ctx, measureTarget, measureKey, bindSource, () =>
                measureLocalCollisionTriangles(bindScene, { scale: bindScale, offset: bindOffset }),
              );
            },
      },
      frameState?.renderer ?? null,
    );
    const instanceBuilt = built;

    const baseY = liveModel.y ?? 0;
    const signature = motionSignature(plan, motionParts.locomotion, lowTier);
    motion = {
      footIk: plan.footIk === undefined || ctx === null || instanceId === undefined
        ? null
        : new FootIkDriver({
            scene: instanceBuilt.scene,
            config: plan.footIk,
            ctx,
            instanceId,
            groundOffset: baseY,
            ...(plan.footIk === "auto" ? ENGINE_IK_OPTIONS : {}),
          }),
      glance: !plan.glance || ctx === null || instanceId === undefined
        ? null
        : new GlanceDriver({ scene: instanceBuilt.scene, enabled: true, ctx, instanceId, maxCameraDistance: ENGINE_MOTION_CAMERA_DISTANCE }),
      signature,
    };

    if (instanceId !== undefined) {
      const muzzleBone = findMuzzleBone(instanceBuilt.scene);
      if (muzzleBone !== null) {
        const isMuzzle = muzzleBone.name.toLowerCase().replace(/[^a-z0-9]/g, "").includes("muzzle");
        instanceBuilt.offs.push(registerEntityMuzzle(instanceId, (target) => {
          muzzleBone.getWorldPosition(target);
          if (!isMuzzle) {
            const yaw = ctx?.scene.entity.get(instanceId)?.rotationY ?? 0;
            target.x += Math.sin(yaw) * MUZZLE_REACH_M;
            target.z += Math.cos(yaw) * MUZZLE_REACH_M;
          }
          return true;
        }));
      }
    }

    registerBodies();

    if (ctx !== null && measureTarget !== undefined && measureKey !== undefined) {
      const raw = instanceBuilt.bindBounds;
      if (raw !== null) {
        const mountedBounds = {
          min: [raw.min[0] * instanceBuilt.scale + instanceBuilt.position[0], raw.min[1] * instanceBuilt.scale + instanceBuilt.position[1], raw.min[2] * instanceBuilt.scale + instanceBuilt.position[2]] as [number, number, number],
          max: [raw.max[0] * instanceBuilt.scale + instanceBuilt.position[0], raw.max[1] * instanceBuilt.scale + instanceBuilt.position[1], raw.max[2] * instanceBuilt.scale + instanceBuilt.position[2]] as [number, number, number],
          meshCount: raw.meshCount,
        };
        recordRenderBounds(ctx, measureTarget, measureKey, mountedBounds);
        if (dimsMaxY === undefined) reportMeasuredBounds(ctx, measureTarget, measureKey, mountedBounds);
      }
    }

    wornKey = "";
    syncWornLayers();
    buildChildren(liveModel);
    if (seq !== buildSeq || !mounted) {
      // A rebuild or dispose landed while children mounted; tear down again.
      children.clear();
      partDraw = null;
      teardownBuilt();
    }
  }

  function showFallback(): void {
    if (options.fallback === undefined || fallbackShown || !mounted) return;
    fallbackShown = true;
    children.add(children.root, options.fallback());
  }

  async function rebuild(): Promise<void> {
    buildSeq += 1;
    children.clear();
    fallbackShown = false;
    partDraw = null;
    teardownBuilt();
    materialTextures?.dispose();
    materialTextures = null;
    await buildAll();
  }

  return {
    mount(state: EngineFrameState) {
      mounted = true;
      frameState = state;
      children.mount(state);
      if (ctx !== null) {
        offCtx = ctx.subscribe?.(() => {
          const next = computeAppearanceKey();
          if (next !== appearanceKey) {
            appearanceKey = next;
            void rebuild().catch((error) => {
              teardownBuilt();
              showFallback();
              reportFallbackSeam(seam ?? "entity", "renderError");
              if (typeof console !== "undefined") {
                console.warn(`[jgengine] model "${model.url}" rebuild failed.`, error);
              }
            });
          }
        }) ?? null;
      }
      if (ctx !== null && instanceId !== undefined) {
        offDied = ctx.game.events.on("entity.died", (event) => {
          if (event.instanceId === instanceId && deathRemovesEntity(event)) {
            dead = true;
            const next = computeAppearanceKey();
            if (next !== appearanceKey) {
              appearanceKey = next;
              void rebuild().catch(() => {
                teardownBuilt();
                showFallback();
              });
            }
          }
        });
      }
      appearanceKey = computeAppearanceKey();
      void buildAll().catch((error) => {
        if (!mounted) return;
        teardownBuilt();
        showFallback();
        reportFallbackSeam(seam ?? "entity", "renderError");
        if (typeof console !== "undefined") {
          console.warn(`[jgengine] model "${model.url}" failed to load or build; fallback shown.`, error);
        }
      });
    },
    frame(state: EngineFrameState) {
      frameState = state;
      children.frame(state);
      if (built === null) return;
      // Pose order matches the hook subscriptions: animation, first-person
      // head/arms, foot IK, glance.
      built.animation?.pose(state.delta);
      if (built.head !== null) {
        collapseHead(built.head);
        keepHeadUnderEye(built.content, built.head, state.camera, built.bodyRest);
      }
      built.arms?.();
      motion.footIk?.pose(state, state.delta);
      motion.glance?.pose(state, state.delta);
      if (ctx !== null && instanceId !== undefined) {
        const paint = ctx.scene.entity.paint;
        const version = paint.version(instanceId);
        if (version !== paintVersion) {
          paintVersion = version;
          const strokes = paint.strokes(instanceId);
          const cache = cacheStandardMaterials(built.scene, materialCache);
          materialCache = cache;
          if (paintCanvas === null && strokes.length > 0) {
            const seed = cache.materials[0];
            if (seed !== undefined) {
              paintCanvas = createPaintCanvas(seed);
              applyPaintTextureToMaterials(cache.materials, paintCanvas);
            }
          }
          if (paintCanvas !== null) {
            paintDrawnCount = syncPaintCanvas(paintCanvas, cache.seedColor, strokes, paintDrawnCount);
          }
        }
      }
      syncWornLayers();
      // Motion config changes arrive through rebuilds; the only live input is
      // the terrain quality tier, so replan only when it flips.
      const quality = terrainQuality();
      if (quality !== lastTerrainQuality) {
        lastTerrainQuality = quality;
        syncMotionDrivers();
      }
    },
    dispose(state: EngineFrameState) {
      mounted = false;
      buildSeq += 1;
      offCtx?.();
      offCtx = null;
      offDied?.();
      offDied = null;
      children.dispose(state);
      teardownBuilt();
      materialTextures?.dispose();
      materialTextures = null;
      partDraw = null;
      frameState = null;
    },
  };
}

// ---------------------------------------------------------------------------
// Single-variant LOD and sprites

/** Whether an isolated model switches variant levels: it needs both levels and a live instance to measure from. */
export function isolatedModelUsesVariants(model: ModelConfig, instanceId: string | undefined): boolean {
  return model.variants !== undefined && instanceId !== undefined;
}

/**
 * The draw `IsolatedEntityModel` mounts: the camera-distance level switch when the
 * model has variants and a live instance, the plain entity model otherwise.
 */
export function isolatedEntityModelDraw(options: EntityModelDrawOptions): EngineDraw {
  return isolatedModelUsesVariants(options.model, options.instanceId)
    ? singleVariantModelDraw(options)
    : entityModelDraw(options);
}

/**
 * One prop at its own camera distance with level switching — the
 * `SingleVariantModel` contract as a draw.
 */
export function singleVariantModelDraw(options: EntityModelDrawOptions): EngineDraw {
  const { model, instanceId, measure, ctx, lodLevel: _lodLevel, seam, fallback } = options;
  const variants = model.variants;
  if (variants === undefined || instanceId === undefined) return entityModelDraw(options);
  const selector = createModelVariantSelector(variants);
  const cameraAt = new THREE.Vector3();
  const probe = new THREE.Vector3();
  let level = 0;
  let inner: EngineDraw | null = null;
  let innerState: EngineFrameState | null = null;
  const host = new THREE.Group();
  let warmed = false;

  function swapLevel(state: EngineFrameState, next: number): void {
    if (next === level && inner !== null) return;
    level = next;
    inner?.dispose?.(innerState ?? state);
    inner = null;
    const drawn = variantLevelModel(model, next);
    const child = entityModelDraw({
      model: drawn,
      instanceId,
      measure: next === 0 ? measure : undefined,
      lodLevel: next,
      ctx,
      seam,
      fallback,
    });
    const childState = childFrameState(state, host);
    child.mount?.(childState);
    inner = child;
    innerState = childState;
  }

  return {
    mount(state: EngineFrameState) {
      state.scene.add(host);
      if (!warmed) {
        warmed = true;
        // Warm every level so the switch swaps a cached clone, like the React preload.
        for (const candidate of variants.levels) void loadGltf(candidate.url).catch(() => {});
      }
      swapLevel(state, 0);
    },
    frame(state: EngineFrameState) {
      if (ctx !== null && instanceId !== undefined && inner !== null) {
        const placement = ctx.scene.object.get(instanceId)?.position ?? ctx.scene.entity.get(instanceId)?.position;
        if (placement !== undefined) {
          const next = singleVariantLevel(selector, instanceId, state.camera, placement, cameraAt, probe);
          if (next !== level) swapLevel(state, next);
        }
      }
      inner?.frame?.(childFrameState(state, host), state.delta);
    },
    dispose(state: EngineFrameState) {
      inner?.dispose?.(innerState ?? state);
      inner = null;
      state.scene.remove(host);
      host.clear();
    },
  };
}

/** Draws an entity as a camera-facing sprite, playing its atlas clip when it has one. */
export function entitySpriteDraw(sprite: EntitySpriteConfig): EngineDraw {
  const material = new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.08, depthWrite: false });
  const spriteObject = new THREE.Sprite(material);
  spriteObject.position.y = sprite.y;
  spriteObject.scale.set(sprite.width, sprite.height, 1);
  const player = sprite.clip === undefined ? null : createSpriteClipPlayer(sprite.clip.atlas);
  const animation = sprite.clip?.animation;
  let texture: THREE.Texture | null = null;
  let mounted = false;

  return {
    mount(state: EngineFrameState) {
      mounted = true;
      state.scene.add(spriteObject);
      const url = sprite.clip?.atlas.image ?? sprite.url;
      const loader = new THREE.TextureLoader();
      void loader.loadAsync(url).then((loaded) => {
        if (!mounted) {
          loaded.dispose();
          return;
        }
        texture = loaded.clone();
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        texture.needsUpdate = true;
        material.map = texture;
        material.needsUpdate = true;
        if (player !== null && animation !== undefined) player.play(animation);
        if (texture !== null && sprite.clip !== undefined) {
          const frame = player?.frame();
          if (frame !== undefined) syncSpriteFrame(texture, frame, sprite.clip.atlas.size);
        }
        if (player === null) {
          if (texture !== null) {
            texture.repeat.set(1, 1);
            texture.offset.set(0, 0);
          }
        }
        state.invalidate();
      });
    },
    frame(state: EngineFrameState) {
      if (player === null || sprite.clip === undefined || texture === null) return;
      player.advance(state.delta);
      const frame = player.frame();
      if (frame === undefined) return;
      syncSpriteFrame(texture, frame, sprite.clip.atlas.size);
    },
    dispose(state: EngineFrameState) {
      mounted = false;
      state.scene.remove(spriteObject);
      texture?.dispose();
      texture = null;
      material.dispose();
    },
  };
}
