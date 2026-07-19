import { useFrame, useLoader } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";

import type { EntitySpriteConfig, ModelConfig, ModelMaterialMaps } from "@jgengine/core/game/playableGame";
import { useGameContext } from "@jgengine/react/provider";

import { sharedGltfLoader } from "./modelLoad";
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
  const texture = useLoader(THREE.TextureLoader, sprite.url);
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
  }, [texture]);

  return (
    <sprite position-y={sprite.y} scale={[sprite.width, sprite.height, 1]}>
      <spriteMaterial map={texture} transparent alphaTest={0.08} depthWrite={false} />
    </sprite>
  );
}

class ModelFallbackBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function IsolatedEntityModel({
  model,
  instanceId,
  fallback,
}: {
  model: ModelConfig;
  instanceId?: string;
  fallback?: ReactNode;
}) {
  return (
    <ModelFallbackBoundary fallback={fallback ?? null}>
      <Suspense fallback={null}>
        <EntityModel model={model} instanceId={instanceId} />
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
      <EntityModel model={model} />
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
    return record;
  }, [maps.color, maps.normal, maps.roughness, maps.ao]);
  const textures = useTexture(entries) as Partial<Record<"color" | "normal" | "roughness" | "ao", THREE.Texture>>;
  useEffect(() => {
    if (textures.color !== undefined) textures.color.colorSpace = THREE.SRGBColorSpace;
    applyMaterialOverride(scene, {}, { clone: false, textures });
  }, [scene, textures]);
  return null;
}

export function EntityModel({ model, instanceId }: { model: ModelConfig; instanceId?: string }) {
  const gltf = useLoader(sharedGltfLoader, model.url);
  const ctx = useGameContext();
  const material = model.material;
  const baseY = model.y ?? 0;
  const dims = model.dims;

  const scene = useMemo(() => {
    const cloned = cloneModelScene(gltf.scene);
    if (material !== undefined) applyMaterialOverride(cloned, material, { clone: false });
    return cloned;
  }, [gltf, material]);

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
    if (instanceId === undefined) return;
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
      {material?.maps !== undefined ? <ModelMaterialMapsApplier scene={scene} maps={material.maps} /> : null}
      {(model.attachments ?? []).map((attachment, index) =>
        typeof attachment.model === "string" ? null : (
          <BoneAttachment
            key={`${attachment.slot}-${index}`}
            rig={scene}
            model={attachment.model}
            slot={attachment.slot}
            position={attachment.position}
            rotation={attachment.rotation}
            scale={attachment.scale}
          />
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
        renderPart={(part) => (typeof part.model === "string" ? null : <EntityModel model={part.model} />)}
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
