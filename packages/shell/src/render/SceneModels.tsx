import { useFrame, useLoader } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";

import type { EntitySpriteConfig, ModelConfig, ModelMaterialMaps } from "@jgengine/core/game/playableGame";
import { resolveOneShotClip } from "@jgengine/core/game/modelAnimation";
import { useGameContext } from "@jgengine/react/provider";

import { sharedGltfLoader } from "./modelLoad";
import { measureLocalBounds, reportMeasuredBounds } from "./measureBounds";
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
  measure,
  fallback,
}: {
  model: ModelConfig;
  instanceId?: string;
  measure?: MeasureTarget;
  fallback?: ReactNode;
}) {
  return (
    <ModelFallbackBoundary fallback={fallback ?? null}>
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

  // A model without index-measured dims can't drive the fitted-collider path, so report the live
  // measurement (the primitive mounts with only this uniform scale + position) instead of letting
  // the kind fall back to a fixed-size box. Index dims keep priority — skip when they exist.
  const measureTarget = measure?.target;
  const measureKey = measure?.key;
  const dimsMaxY = dims?.maxY;
  const [positionX, positionY, positionZ] = position;
  useEffect(() => {
    if (measureTarget === undefined || measureKey === undefined || dimsMaxY !== undefined) return;
    const raw = measureLocalBounds(scene);
    if (raw === null) return;
    reportMeasuredBounds(ctx, measureTarget, measureKey, {
      min: [raw.min[0] * scale + positionX, raw.min[1] * scale + positionY, raw.min[2] * scale + positionZ],
      max: [raw.max[0] * scale + positionX, raw.max[1] * scale + positionY, raw.max[2] * scale + positionZ],
      meshCount: raw.meshCount,
    });
  }, [ctx, scene, scale, positionX, positionY, positionZ, measureTarget, measureKey, dimsMaxY]);

  const animation = model.animation;
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const animationPausedRef = useRef(false);
  const stateActionsRef = useRef<{
    actions: Partial<Record<"idle" | "walk" | "run", THREE.AnimationAction>>;
    active: "idle" | "walk" | "run";
    lastPos: [number, number, number] | null;
    smoothedSpeed: number;
  } | null>(null);
  const states = animation?.states;
  const oneShots = animation?.oneShots;
  const oneShotPlayRef = useRef<((event: string) => void) | null>(null);
  const activeOneShotRef = useRef<{ action: THREE.AnimationAction; isDeath: boolean } | null>(null);

  useEffect(() => {
    if (animation === undefined || gltf.animations.length === 0) {
      mixerRef.current = null;
      stateActionsRef.current = null;
      return;
    }
    const mixer = new THREE.AnimationMixer(scene);
    if (states !== undefined) {
      const clipFor = (name: string) =>
        THREE.AnimationClip.findByName(gltf.animations, name) ?? gltf.animations[0]!;
      const actions: Partial<Record<"idle" | "walk" | "run", THREE.AnimationAction>> = {
        idle: mixer.clipAction(clipFor(states.idle)),
        walk: mixer.clipAction(clipFor(states.walk)),
        ...(states.run === undefined ? {} : { run: mixer.clipAction(clipFor(states.run)) }),
      };
      for (const action of Object.values(actions)) {
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.timeScale = animation.timeScale ?? 1;
        action.enabled = true;
      }
      actions.idle!.play();
      mixer.update(0);
      mixerRef.current = mixer;
      stateActionsRef.current = { actions, active: "idle", lastPos: null, smoothedSpeed: 0 };
      animationPausedRef.current = false;

      let onOneShotFinished: ((event: { action: THREE.AnimationAction }) => void) | null = null;
      if (oneShots !== undefined) {
        const clipNames = new Set<string>();
        for (const spec of Object.values(oneShots)) {
          if (typeof spec === "string") clipNames.add(spec);
          else for (const name of spec) clipNames.add(name);
        }
        const oneShotActions = new Map<string, THREE.AnimationAction>();
        for (const name of clipNames) {
          const found = THREE.AnimationClip.findByName(gltf.animations, name);
          if (found === null) continue;
          const oneShotAction = mixer.clipAction(found);
          oneShotAction.setLoop(THREE.LoopOnce, 1);
          oneShotAction.enabled = true;
          oneShotActions.set(name, oneShotAction);
        }
        onOneShotFinished = ({ action }) => {
          const active = activeOneShotRef.current;
          if (active === null || action !== active.action || active.isDeath) return;
          const machine = stateActionsRef.current;
          const back = machine?.actions[machine.active];
          action.fadeOut(0.15);
          if (back !== undefined) back.reset().fadeIn(0.15).play();
          activeOneShotRef.current = null;
        };
        mixer.addEventListener("finished", onOneShotFinished);
        oneShotPlayRef.current = (event: string) => {
          const active = activeOneShotRef.current;
          if (active !== null && active.isDeath) return;
          const clipName = resolveOneShotClip(oneShots, event, Math.random());
          if (clipName === null) return;
          const oneShotAction = oneShotActions.get(clipName);
          if (oneShotAction === undefined) return;
          const machine = stateActionsRef.current;
          machine?.actions[machine.active]?.fadeOut(0.1);
          if (active !== null && active.action !== oneShotAction) active.action.stop();
          oneShotAction.clampWhenFinished = event === "death";
          oneShotAction.reset().fadeIn(0.1).play();
          activeOneShotRef.current = { action: oneShotAction, isDeath: event === "death" };
        };
      }

      return () => {
        if (onOneShotFinished !== null) mixer.removeEventListener("finished", onOneShotFinished);
        oneShotPlayRef.current = null;
        activeOneShotRef.current = null;
        mixer.stopAllAction();
        mixerRef.current = null;
        stateActionsRef.current = null;
      };
    }
    const clip =
      (animation.clip !== undefined ? THREE.AnimationClip.findByName(gltf.animations, animation.clip) : undefined) ??
      gltf.animations[0]!;
    const action = mixer.clipAction(clip);
    action.setLoop(animation.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = animation.loop === false;
    action.timeScale = animation.timeScale ?? 1;
    action.enabled = true;
    action.paused = animation.paused === true;
    action.play();
    if (animation.time !== undefined) action.time = animation.time;
    mixer.update(0);
    mixerRef.current = mixer;
    animationPausedRef.current = animation.paused === true;
    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
    };
  }, [
    scene,
    gltf,
    animation?.clip,
    animation?.loop,
    animation?.timeScale,
    animation?.paused,
    animation?.time,
    states,
    oneShots,
  ]);

  useEffect(() => {
    if (instanceId === undefined || oneShots === undefined) return;
    const fire = (event: string) => oneShotPlayRef.current?.(event);
    const offAnimation = ctx.game.events.on("entity.animation", (event) => {
      if (event.instanceId === instanceId) fire(event.event);
    });
    const offHit = ctx.game.events.on("combat.hitReaction", (event) => {
      if (event.instanceId === instanceId) fire("hit");
    });
    const offDied = ctx.game.events.on("entity.died", (event) => {
      if (event.instanceId === instanceId) fire("death");
    });
    return () => {
      offAnimation();
      offHit();
      offDied();
    };
  }, [ctx, instanceId, oneShots]);

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

  useFrame((_state, delta) => {
    const stateMachine = stateActionsRef.current;
    if (stateMachine !== null && states !== undefined && instanceId !== undefined && delta > 0) {
      const entity = ctx.scene.entity.get(instanceId);
      if (entity !== null) {
        const [x, , z] = entity.position;
        if (stateMachine.lastPos !== null) {
          const instantSpeed =
            Math.hypot(x - stateMachine.lastPos[0], z - stateMachine.lastPos[2]) / delta;
          stateMachine.smoothedSpeed +=
            (instantSpeed - stateMachine.smoothedSpeed) * Math.min(1, delta * 12);
        }
        stateMachine.lastPos = [x, entity.position[1], z];
        const walkSpeed = states.walkSpeed ?? 0.5;
        const runSpeed = states.runSpeed ?? 6;
        const next: "idle" | "walk" | "run" =
          stateMachine.smoothedSpeed < walkSpeed
            ? "idle"
            : stateMachine.actions.run !== undefined && stateMachine.smoothedSpeed >= runSpeed
              ? "run"
              : "walk";
        if (next !== stateMachine.active) {
          if (activeOneShotRef.current === null) {
            const fade = states.fadeSec ?? 0.2;
            const from = stateMachine.actions[stateMachine.active];
            const to = stateMachine.actions[next];
            if (from !== undefined && to !== undefined) {
              to.reset().fadeIn(fade).play();
              from.fadeOut(fade);
            }
          }
          stateMachine.active = next;
        }
      }
    }
    if (mixerRef.current !== null && !animationPausedRef.current) mixerRef.current.update(delta);
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

  return (
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
      {(model.parts ?? []).map((part, index) =>
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
