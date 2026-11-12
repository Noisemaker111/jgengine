/** @jsxImportSource @jgengine/core/ui/jsx */
import * as THREE from "three";

import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { sharedGltfLoader } from "@jgengine/core/model/modelLoad.draw";
import { hashString } from "@jgengine/core/random/rng";
import { cloneModelScene, disposeClonedMaterials, modelPlacementTransform, standardMaterialsOf } from "@jgengine/core/model/modelRender.draw";
import { ModelAnimationDriver } from "@jgengine/core/anim/modelAnimationDriver.draw";
import { useGameContext } from "@jgengine/ui/provider";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";

import { bodyColor, type AlienBodyPlan } from "../creatures/bodyPlan";
import { moodOfNeeds } from "../agents";
import { MOOD_COLORS } from "../palette";
import { householdStore } from "../session/store";
import { resolveAlienMeshUrl } from "../models";

const ALIEN_HEIGHT = 1.7;

function planOf(entity: SceneEntity): AlienBodyPlan | null {
  const meta = entity.meta as { bodyPlan?: AlienBodyPlan } | null;
  return meta?.bodyPlan ?? null;
}

function bodyScale(plan: AlienBodyPlan): [number, number, number] {
  const base = 0.75 + plan.size * 0.35;
  switch (plan.shape) {
    case "tall":
      return [base * 0.92, base * 1.16, base * 0.92];
    case "blob":
      return [base * 1.12, base * 0.86, base * 1.12];
    case "insectoid":
      return [base * 0.95, base * 1.02, base * 1.08];
    default:
      return [base, base, base];
  }
}

interface AlienLive {
  readonly materials: THREE.MeshStandardMaterial[];
  readonly driver: ModelAnimationDriver;
  readonly scene: THREE.Object3D;
  lastEmissive: string | null;
  lastIntensity: number;
}

/**
 * One alien's GLB clone, animation driver and mood glow as an {@link EngineDraw}. Store reads
 * (movement, mood tier, glow) happen per frame through the context, so no UI subscription is
 * needed; a failed or absent plan/GLB simply draws nothing, matching the old error boundary.
 */
export function alienMeshDraw(ctx: GameContext | null, entity: SceneEntity): EngineDraw {
  const group = new THREE.Group();
  const bob = new THREE.Group();
  group.add(bob);
  const plan = planOf(entity);
  const phase = (hashString(entity.id) % 628) / 100;
  const color = plan === null ? "#000000" : bodyColor(plan, 72);
  const tint = new THREE.Color(color);
  let live: AlienLive | null = null;
  let cancelled = false;

  const memberNow = () => (ctx === null ? undefined : householdStore.read(ctx).members[entity.id]);
  const emissiveNow = () => {
    const member = memberNow();
    const tier = member === undefined ? null : moodOfNeeds(member.needs).tier;
    return (tier === null ? undefined : MOOD_COLORS[tier]) ?? "#000000";
  };
  const glowNow = () => {
    const member = memberNow();
    return member !== undefined ? 0.025 + (moodOfNeeds(member.needs).score / 100) * 0.06 : 0.025;
  };

  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      if (plan === null) return;
      const meshUrl = resolveAlienMeshUrl(plan.shape);
      void sharedGltfLoader.loadAsync(meshUrl).then((gltf) => {
        if (cancelled) return;
        try {
          const scene = cloneModelScene(gltf.scene);
          const materials = standardMaterialsOf(scene);
          const nativeColors = materials.map((material) => material.color.clone());
          const tinted = nativeColors.map((native) => native.clone().lerp(tint, 0.8));
          const placement = modelPlacementTransform(scene, { url: meshUrl, targetHeight: ALIEN_HEIGHT });
          const driver = new ModelAnimationDriver({
            scene,
            clips: gltf.animations,
            animationInput: { auto: true, clock: "game" },
            instanceId: entity.id,
            ctx,
            invalidate: () => state.invalidate(),
          });
          const scaleGroup = new THREE.Group();
          scaleGroup.scale.set(...bodyScale(plan));
          const placeGroup = new THREE.Group();
          placeGroup.scale.setScalar(placement.scale);
          placeGroup.position.set(...placement.position);
          scaleGroup.add(placeGroup);
          placeGroup.add(scene);
          bob.add(scaleGroup);
          const emissive = emissiveNow();
          const intensity = glowNow();
          for (const [index, material] of materials.entries()) {
            material.color.copy(tinted[index]!);
            material.emissive.set(emissive);
            material.emissiveIntensity = intensity;
          }
          live = { materials, driver, scene, lastEmissive: emissive, lastIntensity: intensity };
        } catch {
          // The old ModelErrorBoundary rendered nothing on a bad GLB.
        }
      }).catch(() => {});
    },
    frame(state: EngineFrameState) {
      const current = live;
      if (current === null) return;
      const member = memberNow();
      const moving = member !== undefined && (member.action.kind === "seek" || member.action.kind === "wander");
      bob.position.y = moving ? 0 : Math.sin(state.clock.elapsedTime * 1.6 + phase) * 0.02;
      current.driver.pose(state.delta);
      const emissive = emissiveNow();
      const intensity = glowNow();
      if (emissive !== current.lastEmissive || intensity !== current.lastIntensity) {
        current.lastEmissive = emissive;
        current.lastIntensity = intensity;
        for (const material of current.materials) {
          material.emissive.set(emissive);
          material.emissiveIntensity = intensity;
        }
      }
    },
    dispose(state: EngineFrameState) {
      cancelled = true;
      state.scene.remove(group);
      group.clear();
      bob.clear();
      if (live !== null) {
        live.driver.dispose();
        disposeClonedMaterials(live.scene);
        live = null;
      }
    },
  };
}

export function AlienMesh({ entity }: { entity: SceneEntity }) {
  const ctx = useGameContext();
  return <EngineDrawMount create={() => alienMeshDraw(ctx, entity)} deps={[ctx, entity]} />;
}
