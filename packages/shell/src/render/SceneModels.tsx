import { useFrame, useLoader } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";

import type { EntitySpriteConfig, ModelConfig, ModelMaterialMaps } from "@jgengine/core/game/playableGame";
import { createSpriteClipPlayer } from "@jgengine/core/render/sprite2d";
import { reportFallbackSeam, type FallbackSeam } from "@jgengine/core/devtools/fallbackSeams";
import { useOptionalGameContext } from "@jgengine/react/provider";

import { sharedGltfLoader } from "./modelLoad";
import { measureLocalBounds, reportMeasuredBounds } from "./measureBounds";
import { measureLocalCollisionTriangles, reportMeasuredCollisionMesh } from "./measureCollisionMesh";
import { useModelAnimation } from "./useModelAnimation";
import { PartMotionRig } from "./PartMotion";
import { applyMaterialOverride } from "../materialOverride";
import {
  applyPaintTextureToMaterials,
  cacheStandardMaterials,
  cloneModelScene,
  createPaintCanvas,
  disposeClonedMaterials,
  disposePaintCanvas,
  syncPaintCanvas,
  type MaterialCache,
  type PaintCanvas,
} from "./modelRender";

export function EntitySprite({ sprite }: { sprite: EntitySpriteConfig }) {
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
  }, [player, animation]);

  useFrame((_state, delta) => {
    if (player === null || sprite.clip === undefined) return;
    player.advance(delta);
    const frame = player.frame();
    if (frame === undefined) return;
    const [atlasWidth, atlasHeight] = sprite.clip.atlas.size;
    map.repeat.set(frame.w / atlasWidth, frame.h / atlasHeight);
    map.offset.set(frame.x / atlasWidth, 1 - (frame.y + frame.h) / atlasHeight);
    map.needsUpdate = true;
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
  return (
    <ModelFallbackBoundary fallback={fallback ?? null} url={model.url} seam={measure?.target}>
      <Suspense fallback={null}>
        <EntityModel model={model} instanceId={instanceId} measure={measure} />
      </Suspense>
    </ModelFallbackBoundary>
  );
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
    const bone = rig.getObjectByName(slot);
    if (bone === undefined) {
      if (typeof console !== "undefined") {
        console.warn(`[jgengine] entityModels attachment: bone/slot "${slot}" not found on the rig`);
      }
      return;
    }
    weaponScene.position.set(px, py, pz);
    weaponScene.rotation.set(rx, ry, rz);
    weaponScene.scale.setScalar(s);
    bone.add(weaponScene);
    return () => {
      bone.remove(weaponScene);
    };
  }, [rig, weaponScene, slot, px, py, pz, rx, ry, rz, s]);

  useEffect(() => () => disposeClonedMaterials(weaponScene), [weaponScene]);

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

function ModelMaterialMapsApplier({ scene, maps }: { scene: THREE.Object3D; maps: ModelMaterialMaps }) {
  const entries = useMemo(() => {
    const record: Record<string, string> = {};
    if (maps.color !== undefined) record.color = maps.color;
    if (maps.normal !== undefined) record.normal = maps.normal;
    if (maps.roughness !== undefined) record.roughness = maps.roughness;
    if (maps.ao !== undefined) record.ao = maps.ao;
    if (maps.metalness !== undefined) record.metalness = maps.metalness;
    if (maps.emissive !== undefined) record.emissive = maps.emissive;
    if (maps.height !== undefined) record.height = maps.height;
    return record;
  }, [maps.color, maps.normal, maps.roughness, maps.ao, maps.metalness, maps.emissive, maps.height]);
  const textures = useTexture(entries) as Partial<Record<"color" | "normal" | "roughness" | "ao" | "metalness" | "emissive" | "height", THREE.Texture>>;
  useEffect(() => {
    if (textures.color !== undefined) textures.color.colorSpace = THREE.SRGBColorSpace;
    applyMaterialOverride(scene, {}, { clone: false, textures });
  }, [scene, textures]);
  return null;
}

/** Where a measured model reports its rendered bounds: an entity kind or an object catalog id. */
export interface MeasureTarget {
  target: "entity" | "object";
  key: string;
}

export function EntityModel({
  model,
  instanceId,
  measure,
}: {
  model: ModelConfig;
  instanceId?: string;
  measure?: MeasureTarget;
}) {
  const gltf = useLoader(sharedGltfLoader, model.url);
  // Optional, not required: measured bounds and paint strokes are live-world extras, and a model
  // that threw without a running game could not be inspected outside one — which is how a broken
  // composition stayed undiagnosable in `EntityPreview` (#1588).
  const ctx = useOptionalGameContext();
  const material = model.material;
  const baseY = model.y ?? 0;
  const dims = model.dims;

  const shadows = model.shadows;
  const scene = useMemo(() => {
    const cloned = cloneModelScene(gltf.scene, { shadows });
    if (material !== undefined) applyMaterialOverride(cloned, material, { clone: false });
    return cloned;
  }, [gltf, material, shadows]);

  const measured = useMemo(() => {
    if (model.targetHeight === undefined) return null;
    const box = new THREE.Box3().setFromObject(scene);
    const height = box.max.y - box.min.y;
    if (!Number.isFinite(height) || height <= 0) return null;
    return {
      normalize: model.targetHeight / height,
      minY: box.min.y,
      centerX: (box.min.x + box.max.x) / 2,
      centerZ: (box.min.z + box.max.z) / 2,
    };
  }, [scene, model.targetHeight]);

  const scale = (model.scale ?? 1) * (measured?.normalize ?? 1);
  const centered = (model.anchor ?? "center") === "center" && dims !== undefined;
  const position: [number, number, number] =
    measured !== null
      ? [-scale * measured.centerX, baseY - scale * measured.minY, -scale * measured.centerZ]
      : centered
        ? [-scale * dims!.center.x, baseY - scale * dims!.minY, -scale * dims!.center.z]
        : [0, baseY, 0];

  useEffect(
    () => () => {
      disposeClonedMaterials(scene);
    },
    [scene],
  );

  // A model without index-measured dims can't drive the fitted-collider path, so report the live
  // measurement (the primitive mounts with only this uniform scale + position) instead of letting
  // the kind fall back to a fixed-size box. Index dims keep priority — skip when they exist.
  const measureTarget = measure?.target;
  const measureKey = measure?.key;
  const dimsMaxY = dims?.maxY;
  const [positionX, positionY, positionZ] = position;
  useEffect(() => {
    if (ctx === null || measureTarget === undefined || measureKey === undefined || dimsMaxY !== undefined) return;
    const raw = measureLocalBounds(scene);
    if (raw === null) return;
    reportMeasuredBounds(ctx, measureTarget, measureKey, {
      min: [raw.min[0] * scale + positionX, raw.min[1] * scale + positionY, raw.min[2] * scale + positionZ],
      max: [raw.max[0] * scale + positionX, raw.max[1] * scale + positionY, raw.max[2] * scale + positionZ],
      meshCount: raw.meshCount,
    });
  }, [ctx, scene, scale, positionX, positionY, positionZ, measureTarget, measureKey, dimsMaxY]);

  // Runs with or without index dims: the loaded geometry upgrades whatever box the kind resolved
  // (fitted or measured) to a hitbox that raycasts the model's own triangles.
  useEffect(() => {
    if (ctx === null || measureTarget === undefined || measureKey === undefined) return;
    const triangles = measureLocalCollisionTriangles(scene, {
      scale,
      offset: [positionX, positionY, positionZ],
    });
    if (triangles !== null) reportMeasuredCollisionMesh(ctx, measureTarget, measureKey, triangles);
  }, [ctx, scene, scale, positionX, positionY, positionZ, measureTarget, measureKey]);

  useModelAnimation(scene, gltf.animations, model.animation, instanceId);

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

  useFrame(() => {
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
      {material?.maps !== undefined ? (
        <IsolatedModelPart model={model}>
          <ModelMaterialMapsApplier scene={scene} maps={material.maps} />
        </IsolatedModelPart>
      ) : null}
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
