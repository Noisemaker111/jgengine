import { useFrame, useLoader } from "@react-three/fiber";
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";

import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { sharedGltfLoader } from "@jgengine/core/model/modelLoad.draw";
import { hashString } from "@jgengine/core/random/rng";
import { cloneModelScene, disposeClonedMaterials, modelPlacementTransform, standardMaterialsOf } from "@jgengine/core/model/modelRender.draw";
import { useModelAnimation } from "@jgengine/core/anim/useModelAnimation.draw";
import { useStore } from "@jgengine/react/store";
import { useGameContext } from "@jgengine/react/provider";

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

class ModelErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

function AlienModel({
  meshUrl,
  instanceId,
  scale,
  color,
  emissive,
  emissiveIntensity,
}: {
  meshUrl: string;
  instanceId: string;
  scale: [number, number, number];
  color: string;
  emissive: string;
  /** The glow follows the being's mood every tick; it is written to the materials each frame, not through a render. */
  emissiveIntensity: () => number;
}): ReactNode {
  const gltf = useLoader(sharedGltfLoader, meshUrl);

  const scene = useMemo(() => cloneModelScene(gltf.scene), [gltf]);
  const materials = useMemo(() => standardMaterialsOf(scene), [scene]);
  const nativeColors = useMemo(() => materials.map(material => material.color.clone()), [materials]);
  const placement = useMemo(() => modelPlacementTransform(scene, { url: meshUrl, targetHeight: ALIEN_HEIGHT }), [scene, meshUrl]);

  useEffect(() => () => disposeClonedMaterials(scene), [scene]);

  // Engine animation driver: derives idle/walk clips from the GLB's own clip names and
  // crossfades from the entity's live movement — no game-side mixer or clip strings.
  useModelAnimation(scene, gltf.animations, { auto: true, clock: "game" }, instanceId);

  useEffect(() => {
    const tint = new THREE.Color(color);
    for (const [index, material] of materials.entries()) {
      material.color.copy(nativeColors[index]!).lerp(tint, 0.8);
      material.emissive.set(emissive);
      material.emissiveIntensity = emissiveIntensity();
    }
  }, [materials, nativeColors, color, emissive]);
  useFrame(() => {
    const intensity = emissiveIntensity();
    for (const material of materials) {
      if (material.emissiveIntensity !== intensity) material.emissiveIntensity = intensity;
    }
  });

  return (
    <group scale={scale}>
      <group scale={placement.scale} position={placement.position}>
        <primitive object={scene} />
      </group>
    </group>
  );
}

export function AlienMesh({ entity }: { entity: SceneEntity }): ReactNode {
  const plan = planOf(entity);
  const ctx = useGameContext();
  const groupRef = useRef<THREE.Group>(null);
  const phase = useMemo(() => (hashString(entity.id) % 628) / 100, [entity.id]);
  const { moving, tier } = useStore(householdStore, (household) => {
    const member = household.members[entity.id];
    return {
      moving: member !== undefined && (member.action.kind === "seek" || member.action.kind === "wander"),
      tier: member !== undefined ? moodOfNeeds(member.needs).tier : null,
    };
  });
  const glow = useCallback(() => {
    const member = householdStore.read(ctx).members[entity.id];
    return member !== undefined ? 0.025 + (moodOfNeeds(member.needs).score / 100) * 0.06 : 0.025;
  }, [ctx, entity.id]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (groupRef.current !== null) {
      groupRef.current.position.y = moving ? 0 : Math.sin(t * 1.6 + phase) * 0.02;
    }
  });

  if (plan === null) return null;
  const meshUrl = resolveAlienMeshUrl(plan.shape);

  const color = bodyColor(plan, 72);
  const emissive = (tier === null ? undefined : MOOD_COLORS[tier]) ?? "#000000";
  const scale = bodyScale(plan);
  return (
    <group ref={groupRef}>
      <ModelErrorBoundary>
        <Suspense fallback={null}>
          <AlienModel meshUrl={meshUrl} instanceId={entity.id} scale={scale} color={color} emissive={emissive} emissiveIntensity={glow} />
        </Suspense>
      </ModelErrorBoundary>
    </group>
  );
}

