// @skill jgengine-assets
import { deathRemovesEntity } from "@jgengine/core/combat/death";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { Component, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import * as THREE from "three";

import type { EntitySpriteConfig, ModelConfig } from "@jgengine/core/game/playableGame";
import type { GameContext } from "@jgengine/core/runtime/gameContextTypes";
import { parseModelHiddenNodes } from "@jgengine/core/editor/modelNodeVisibility";
import { createSpriteClipPlayer } from "@jgengine/core/render/sprite2d";
import { reportFallbackSeam, type FallbackSeam } from "@jgengine/core/devtools/fallbackSeams";
import { createModelVariantSelector } from "@jgengine/core/lod/modelLod";
import { useOptionalGameContext } from "@jgengine/react/provider";

import { detectKtx2Support, sharedGltfLoader } from "./modelLoad.draw";
import { modelAssetRequests } from "./modelAssets";
import { measureLocalBounds, reportMeasuredBounds } from "./measureBounds.draw";
import { recordRenderBounds } from "@jgengine/core/visibility/measuredBounds";
import { measureLocalCollisionTriangles, reportCollisionMeshOnce } from "./measureCollisionMesh.draw";
import { useModelInstance } from "./useModelInstance.draw";
import { applyMaterialAssignments, useModelMaterialTextures, MaterialTextureLoader, validateMaterialAssignmentTargets } from "@jgengine/core/material/materialAsset.draw";
import { useFootIk } from "@jgengine/core/anim/useFootIk.draw";
import { resolveRigNode } from "./rigNode.draw";
import { PartMotionRig } from "@jgengine/core/anim/PartMotion.draw";
import { useCharacterGlance } from "@jgengine/core/anim/characterGlance.draw";
import { useEntityMuzzle } from "@jgengine/core/anim/entityMuzzle.draw";
import { registerEntityBody } from "@jgengine/core/anim/CorpseRagdolls.draw";
import { useTerrainQuality } from "@jgengine/core/terrain/terrainQuality.draw";
import { syncSpriteFrame } from "@jgengine/core/render/spriteRender.draw";
import { singleVariantLevel, variantLevelModel } from "@jgengine/core/lod/singleVariantLod.draw";
import { applyMaterialOverride } from "@jgengine/core/material/materialOverride.draw";
import {
  applyPaintTextureToMaterials,
  cacheStandardMaterials,
  cloneModelScene,
  createPaintCanvas,
  disposeModelScene,
  ownModelMaterial,
  disposePaintCanvas,
  syncPaintCanvas,
  type MaterialCache,
  type PaintCanvas,
} from "./modelRender.draw";
import { useFrameWhile } from "@jgengine/core/render/useFrameWhile.draw";

/** No paint layer outside a running game: nothing to subscribe to. */
const noPaintLayer = (): (() => void) => () => {};

/** Draws an entity as a camera-facing sprite, playing its atlas clip when it has one. */
export function EntitySprite({ sprite }: { sprite: EntitySpriteConfig }) {
  const invalidate = useThree((state) => state.invalidate);
  const texture = useLoader(THREE.TextureLoader, sprite.clip?.atlas.image ?? sprite.url);
  const map = useMemo(() => texture.clone(), [texture]);
  const player = useMemo(
    () => (sprite.clip === undefined ? null : createSpriteClipPlayer(sprite.clip.atlas)),
    [sprite.clip],
  );
  const animation = sprite.clip?.animation;

  useEffect(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    map.needsUpdate = true;
    return () => map.dispose();
  }, [map]);

  useEffect(() => {
    if (player !== null && animation !== undefined) player.play(animation);
    const frame = player?.frame();
    if (frame !== undefined && sprite.clip !== undefined) syncSpriteFrame(map, frame, sprite.clip.atlas.size);
    invalidate();
  }, [player, animation, map, sprite.clip, invalidate]);

  useFrame((_state, delta) => {
    if (player === null || sprite.clip === undefined) return;
    player.advance(delta);
    const frame = player.frame();
    if (frame === undefined) return;
    syncSpriteFrame(map, frame, sprite.clip.atlas.size);
  });

  useEffect(() => {
    if (player === null) {
      map.repeat.set(1, 1);
      map.offset.set(0, 0);
    }
  }, [map, player]);

  return (
    <sprite position-y={sprite.y} scale={[sprite.width, sprite.height, 1]}>
      <spriteMaterial map={map} transparent alphaTest={0.08} depthWrite={false} />
    </sprite>
  );
}

/**
 * Catches a render throw from a model subtree and swaps in `fallback` — but never silently: the
 * failed state re-reports to the fallback-seam probe on every render (matching the per-seam frame
 * boundary in `WorldScene`) and the catch warns once with the model url and the error. Without
 * that, a throw anywhere in a composition erases the actor with an empty `probes.fallbacks`.
 * @internal
 */
export class ModelFallbackBoundary extends Component<
  { fallback: ReactNode; children: ReactNode; url: string; seam?: FallbackSeam },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override componentDidCatch(error: unknown): void {
    if (typeof console === "undefined") return;
    console.warn(
      `[jgengine] model "${this.props.url}" threw while rendering and was replaced by its fallback ` +
        `(nothing, unless one was supplied). Fix the throw below — the actor is invisible until then.`,
      error,
    );
  }
  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    reportFallbackSeam(this.props.seam ?? "entity", "renderError");
    return this.props.fallback;
  }
}

/**
 * One model subtree behind its own error boundary and Suspense boundary, so a throwing or
 * still-loading piece cannot erase its siblings. Every nested piece of a composition — parts,
 * attachments, material maps — mounts through this.
 * @internal
 */
export function IsolatedModelPart({
  model,
  seam,
  children,
}: {
  model: ModelConfig;
  seam?: FallbackSeam;
  children: ReactNode;
}) {
  return (
    <ModelFallbackBoundary fallback={null} url={model.url} seam={seam}>
      <Suspense fallback={null}>{children}</Suspense>
    </ModelFallbackBoundary>
  );
}

/** Draws one entity model from its own loaded copy, for models that cannot share a batched instance. */
export function IsolatedEntityModel({
  model,
  instanceId,
  measure,
  fallback,
}: {
  model: ModelConfig;
  instanceId?: string;
  measure?: MeasureTarget;
  fallback?: ReactNode;
}) {
  const levels = model.variants !== undefined && instanceId !== undefined;
  return (
    <ModelFallbackBoundary fallback={fallback ?? null} url={model.url} seam={measure?.target}>
      <Suspense fallback={null}>
        {levels ? (
          <SingleVariantModel model={model} instanceId={instanceId} measure={measure} />
        ) : (
          <EntityModel model={model} instanceId={instanceId} measure={measure} />
        )}
      </Suspense>
    </ModelFallbackBoundary>
  );
}

/**
 * One prop drawn on its own, at its own camera distance: the same level switch the batched prop path
 * runs, so a prop placed at runtime (`scene.object.place`) drops to its cheaper asset exactly like an
 * authored one. Only the active level mounts, so both levels never draw at once, and the level changes
 * only when the shared selector clears its hysteresis edge. Distance is measured from the placement the
 * scene store holds, through memoized scratch vectors, so a frame allocates nothing.
 * @internal
 */
export function SingleVariantModel({
  model,
  instanceId,
  measure,
}: {
  model: ModelConfig;
  instanceId: string;
  measure?: MeasureTarget;
}) {
  const ctx = useOptionalGameContext();
  const variants = model.variants;
  const selector = useMemo(
    () => (variants === undefined ? null : createModelVariantSelector(variants)),
    [variants],
  );
  const [level, setLevel] = useState(0);
  const cameraAt = useMemo(() => new THREE.Vector3(), []);
  const probe = useMemo(() => new THREE.Vector3(), []);
  // Warm every level at mount, so the switch swaps a cached clone instead of suspending on a load.
  for (const candidate of variants?.levels ?? []) useLoader.preload(sharedGltfLoader, candidate.url);
  useFrame((state) => {
    if (selector === null || ctx === null) return;
    const placement = ctx.scene.object.get(instanceId)?.position ?? ctx.scene.entity.get(instanceId)?.position;
    if (placement === undefined) return;
    const next = singleVariantLevel(selector, instanceId, state.camera, placement, cameraAt, probe);
    if (next !== level) setLevel(next);
  });
  const drawn = useMemo(() => variantLevelModel(model, level), [model, level]);
  // The near level owns the measured bounds and collision mesh, like the batched path: a decimated
  // asset must not redefine what the catalog entry collides as.
  return <EntityModel model={drawn} instanceId={instanceId} measure={level === 0 ? measure : undefined} lodLevel={level} />;
}

function BoneAttachment({
  rig,
  model,
  slot,
  position,
  rotation,
  scale,
}: {
  rig: THREE.Object3D;
  model: ModelConfig;
  slot: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}) {
  const gltf = useLoader(sharedGltfLoader, model.url);
  const weaponScene = useMemo(() => cloneModelScene(gltf.scene), [gltf]);
  const px = position?.[0] ?? 0;
  const py = position?.[1] ?? 0;
  const pz = position?.[2] ?? 0;
  const rx = rotation?.[0] ?? 0;
  const ry = rotation?.[1] ?? 0;
  const rz = rotation?.[2] ?? 0;
  const s = scale ?? 1;

  useEffect(() => {
    const resolved = resolveRigNode(rig, slot);
    if (resolved.node === undefined) {
      if (typeof console !== "undefined") {
        console.warn(`[jgengine] entityModels attachment: ${resolved.diagnostic.message}`);
      }
      return;
    }
    const bone = resolved.node;
    weaponScene.position.set(px, py, pz);
    weaponScene.rotation.set(rx, ry, rz);
    weaponScene.scale.setScalar(s);
    bone.add(weaponScene);
    return () => {
      bone.remove(weaponScene);
    };
  }, [rig, weaponScene, slot, px, py, pz, rx, ry, rz, s]);

  useEffect(() => () => disposeModelScene(weaponScene), [weaponScene]);

  return null;
}

/** Renders a static kit-of-parts child at a fixed local offset under the parent model — no bone/rig lookup, unlike `BoneAttachment`. The nested `EntityModel` still applies its own `dims`/anchor centering, so scale/pivot sanity carries over per part. */
function ModelPartGroup({
  model,
  position,
  rotation,
  scale,
}: {
  model: ModelConfig;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position ?? [0, 0, 0]} rotation={rotation ?? [0, 0, 0]} scale={scale ?? 1}>
      <IsolatedModelPart model={model}>
        <EntityModel model={model} />
      </IsolatedModelPart>
    </group>
  );
}

/** Where a measured model reports its rendered bounds: an entity kind or an object catalog id. */
export interface MeasureTarget {
  target: "entity" | "object";
  key: string;
}

/** Draws an entity's model at the given LOD level, with animation, paint layer and bounds measurement. */
export function EntityModel({
  model,
  instanceId,
  measure,
  lodLevel = 0,
}: {
  model: ModelConfig;
  instanceId?: string;
  measure?: MeasureTarget;
  /** The variant level being drawn. Past the source level, a simplified asset may have dropped a selected slot. */
  lodLevel?: number;
}) {
  parseModelHiddenNodes(model.hiddenNodes);
  const renderer = useThree(state => state.gl);
  if ((renderer as THREE.WebGLRenderer & { isWebGLRenderer?: boolean }).isWebGLRenderer) detectKtx2Support(renderer);
  const assets = modelAssetRequests(model);
  for (const url of assets.models) useLoader.preload(sharedGltfLoader, url);
  // Optional, not required: measured bounds and paint strokes are live-world extras, and a model
  // that threw without a running game could not be inspected outside one — which is how a broken
  // composition stayed undiagnosable in `EntityPreview` (#1588).
  const ctx = useOptionalGameContext();
  const material = model.material;
  const materialAssetKey = JSON.stringify((model.materialAssets ?? []).filter(asset => model.materialAssignments?.some(assignment => assignment.materialId === asset.id)));
  const materialAssets = useMemo(() => (model.materialAssets ?? []).filter(asset => model.materialAssignments?.some(assignment => assignment.materialId === asset.id)), [materialAssetKey]);
  const materialAssignments = model.materialAssignments;
  const assignmentSource = useLoader(sharedGltfLoader, materialAssignments?.length ? [model.url] : [])[0]?.scene;
  const assignmentKey = JSON.stringify(materialAssignments);
  const unmatched = lodLevel > 0 ? "skip" : "throw";
  useMemo(() => {
    if (assignmentSource !== undefined) validateMaterialAssignmentTargets(assignmentSource, materialAssets, materialAssignments!, { baseAlphaMode: material?.alphaMode, unmatched });
  }, [assignmentSource, materialAssets, assignmentKey, material?.alphaMode, unmatched]);
  for (const urls of assets.textureGroups) useLoader.preload(MaterialTextureLoader, urls);
  const materialTextures = useModelMaterialTextures(model);
  const baseY = model.y ?? 0;
  const dims = model.dims;

  const configure = useCallback((content: THREE.Object3D) => {
    if (material !== undefined) applyMaterialOverride(content, material, { clone: false, textures: materialTextures.global, ownMaterial: replacement => ownModelMaterial(content, replacement) });
    if (materialAssignments !== undefined) applyMaterialAssignments(content, materialAssets ?? [], materialAssignments, materialTextures.assets, { unmatched });
  }, [material, materialTextures, materialAssets, materialAssignments, unmatched]);
  const { scene, scale, position } = useModelInstance(model, { instanceId, configure });

  // A model without index-measured dims can't drive the fitted-collider path, so report the live
  // measurement (the primitive mounts with only this uniform scale + position) instead of letting
  // the kind fall back to a fixed-size box. Index dims keep priority — skip when they exist.
  const measureTarget = measure?.target;
  const measureKey = measure?.key;
  const dimsMaxY = dims?.maxY;
  const [positionX, positionY, positionZ] = position;
  // Measure before the instance hook's passive animation effects can move imported root nodes.
  useLayoutEffect(() => {
    if (ctx === null || measureTarget === undefined || measureKey === undefined) return;
    const raw = measureLocalBounds(scene);
    if (raw === null) return;
    const mounted = {
      min: [raw.min[0] * scale + positionX, raw.min[1] * scale + positionY, raw.min[2] * scale + positionZ] as [number, number, number],
      max: [raw.max[0] * scale + positionX, raw.max[1] * scale + positionY, raw.max[2] * scale + positionZ] as [number, number, number],
      meshCount: raw.meshCount,
    };
    // Culling always wraps what mounted; colliders take it only when the index has no dims.
    recordRenderBounds(ctx, measureTarget, measureKey, mounted);
    if (dimsMaxY === undefined) reportMeasuredBounds(ctx, measureTarget, measureKey, mounted);
  }, [ctx, scene, scale, positionX, positionY, positionZ, measureTarget, measureKey, dimsMaxY]);

  // Runs with or without index dims: the loaded geometry upgrades whatever box the kind resolved
  // (fitted or measured) to a hitbox that raycasts the model's own triangles.
  useLayoutEffect(() => {
    if (ctx === null || measureTarget === undefined || measureKey === undefined) return;
    const source = `${model.url}|${model.hiddenNodes ?? ""}|${scale}|${positionX},${positionY},${positionZ}`;
    reportCollisionMeshOnce(ctx, measureTarget, measureKey, source, () =>
      measureLocalCollisionTriangles(scene, { scale, offset: [positionX, positionY, positionZ] }),
    );
  }, [ctx, scene, scale, positionX, positionY, positionZ, measureTarget, measureKey, model.url, model.hiddenNodes]);

  const engineMotion = useEngineCharacterMotion(model, ctx, instanceId);
  useFootIk(scene, engineMotion ? "auto" : model.ik === "none" ? undefined : model.ik, ctx, instanceId, baseY, engineMotion ? ENGINE_IK_OPTIONS : undefined);
  useCharacterGlance(scene, engineMotion, ctx, instanceId, ENGINE_MOTION_CAMERA_DISTANCE);
  const muzzleFacing = useCallback(() => (instanceId === undefined ? undefined : ctx?.scene.entity.get(instanceId)?.rotationY) ?? 0, [ctx, instanceId]);
  useEntityMuzzle(scene, instanceId, muzzleFacing);
  useLayoutEffect(() => (instanceId === undefined ? undefined : registerEntityBody(instanceId, scene)), [instanceId, scene]);

  const paintCanvasRef = useRef<PaintCanvas | null>(null);
  const paintDrawnCountRef = useRef(0);
  const paintVersionRef = useRef(-1);
  const materialCacheRef = useRef<MaterialCache | null>(null);

  useEffect(
    () => () => {
      if (paintCanvasRef.current !== null) {
        disposePaintCanvas(paintCanvasRef.current);
        paintCanvasRef.current = null;
      }
      paintDrawnCountRef.current = 0;
      paintVersionRef.current = -1;
      materialCacheRef.current = null;
    },
    [scene],
  );

  // Only a model whose id has been painted joins the frame loop to sync strokes; the rest (nearly
  // every placed prop) never pay for it.
  const paintLayer = ctx?.scene.entity.paint;
  const painted = useSyncExternalStore(
    paintLayer?.subscribe ?? noPaintLayer,
    () => paintLayer !== undefined && instanceId !== undefined && paintLayer.version(instanceId) > 0,
  );
  useFrameWhile(painted, () => {
    if (ctx === null || instanceId === undefined) return;
    const paint = ctx.scene.entity.paint;
    const version = paint.version(instanceId);
    if (version === paintVersionRef.current) return;
    paintVersionRef.current = version;
    const strokes = paint.strokes(instanceId);
    const cache = cacheStandardMaterials(scene, materialCacheRef.current);
    materialCacheRef.current = cache;
    if (paintCanvasRef.current === null) {
      if (strokes.length === 0) return;
      const seed = cache.materials[0];
      if (seed === undefined) return;
      const paintCanvas = createPaintCanvas(seed);
      paintCanvasRef.current = paintCanvas;
      applyPaintTextureToMaterials(cache.materials, paintCanvas);
    }
    paintDrawnCountRef.current = syncPaintCanvas(
      paintCanvasRef.current,
      cache.seedColor,
      strokes,
      paintDrawnCountRef.current,
    );
  });

  const base = (
    <>
      <primitive object={scene} position={position} scale={[scale, scale, scale]} />
      {(model.attachments ?? []).map((attachment, index) =>
        typeof attachment.model === "string" ? null : (
          <IsolatedModelPart key={`${attachment.slot}-${index}`} model={attachment.model}>
            <BoneAttachment
              rig={scene}
              model={attachment.model}
              slot={attachment.slot}
              position={attachment.position}
              rotation={attachment.rotation}
              scale={attachment.scale}
            />
          </IsolatedModelPart>
        ),
      )}
    </>
  );

  const parts = model.parts ?? [];
  // Any role-tagged part switches the composition onto the procedural part-motion rig:
  // root bob/flinch/topple plus per-role limb swing, driven from the entity's live state.
  if (parts.some((part) => part.role !== undefined)) {
    return (
      <PartMotionRig
        parts={parts}
        model={model}
        instanceId={instanceId}
        renderPart={(part) =>
          typeof part.model === "string" ? null : (
            <IsolatedModelPart model={part.model}>
              <EntityModel model={part.model} />
            </IsolatedModelPart>
          )
        }
      >
        {base}
      </PartMotionRig>
    );
  }

  return (
    <>
      {base}
      {parts.map((part, index) =>
        typeof part.model === "string" ? null : (
          <ModelPartGroup
            key={index}
            model={part.model}
            position={part.position}
            rotation={part.rotation}
            scale={part.scale}
          />
        ),
      )}
    </>
  );
}

/** Characters further than this from the camera skip the engine's default foot IK and glance. */
const ENGINE_MOTION_CAMERA_DISTANCE = 20;
const ENGINE_IK_OPTIONS = { quiet: true, maxCameraDistance: ENGINE_MOTION_CAMERA_DISTANCE } as const;

/**
 * Whether the engine's default character motion runs on this model: foot IK on whatever legs the
 * rig has and a head turn toward the local player. On for a live entity whose model leaves `ik`
 * unset, off on the `low` graphics tier and once the entity has died (its death clip and any
 * ragdoll own the pose from then on). `ik: "none"` turns it off.
 */
function useEngineCharacterMotion(model: ModelConfig, ctx: GameContext | null, instanceId: string | undefined): boolean {
  const quality = useTerrainQuality();
  const [dead, setDead] = useState(false);
  useEffect(() => {
    setDead(false);
    if (ctx === null || instanceId === undefined) return;
    return ctx.game.events.on("entity.died", (event) => {
      if (event.instanceId === instanceId && deathRemovesEntity(event)) setDead(true);
    });
  }, [ctx, instanceId]);
  return model.ik === undefined && instanceId !== undefined && ctx !== null && quality !== "low" && !dead;
}
