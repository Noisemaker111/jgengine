import { useFrame, useLoader } from "@react-three/fiber";
import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";

import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { sharedGltfLoader } from "@jgengine/shell/render/modelLoad";
import { cloneModelScene, disposeClonedMaterials, standardMaterialsOf } from "@jgengine/shell/render/modelRender";
import { useModelAnimation } from "@jgengine/shell/render/useModelAnimation";
import { useStore } from "@jgengine/react/store";

import { bodyColor, type AlienBodyPlan } from "../creatures/bodyPlan";
import { moodOf } from "../needs/needs";
import { MOOD_COLORS } from "../palette";
import { householdStore } from "../session/store";
import { resolveAlienMeshUrl } from "../models";

const ALIEN_HEIGHT = 1.7;

function planOf(entity: SceneEntity): AlienBodyPlan | null {
  const meta = entity.meta as { bodyPlan?: AlienBodyPlan } | null;
  return meta?.bodyPlan ?? null;
}

function hash(id: string): number {
  let a = 0;
  for (let i = 0; i < id.length; i++) a = (a * 31 + id.charCodeAt(i)) >>> 0;
  return a;
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
  emissiveIntensity: number;
}): ReactNode {
  const gltf = useLoader(sharedGltfLoader, meshUrl);

  const scene = useMemo(() => cloneModelScene(gltf.scene), [gltf]);
  const materials = useMemo(() => standardMaterialsOf(scene), [scene]);
  const normalizedScale = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const height = box.max.y - box.min.y;
    return Number.isFinite(height) && height > 0 ? ALIEN_HEIGHT / height : 1;
  }, [scene]);

  useEffect(() => () => disposeClonedMaterials(scene), [scene]);

  // Engine animation driver: derives idle/walk clips from the GLB's own clip names and
  // crossfades from the entity's live movement — no game-side mixer or clip strings.
  useModelAnimation(scene, gltf.animations, "auto", instanceId);

  useEffect(() => {
    for (const material of materials) {
      material.color.set(color);
      material.emissive.set(emissive);
      material.emissiveIntensity = emissiveIntensity;
    }
  }, [materials, color, emissive, emissiveIntensity]);

  return (
    <group scale={[normalizedScale * scale[0], normalizedScale * scale[1], normalizedScale * scale[2]]}>
      <primitive object={scene} />
    </group>
  );
}

export function AlienMesh({ entity }: { entity: SceneEntity }): ReactNode {
  const plan = planOf(entity);
  const household = useStore(householdStore);
  const groupRef = useRef<THREE.Group>(null);
  const phase = useMemo(() => (hash(entity.id) % 628) / 100, [entity.id]);
  const meshUrl = useMemo(() => resolveAlienMeshUrl(hash(entity.id)), [entity.id]);

  const member = household.members[entity.id];
  const moving = member !== undefined && (member.action.kind === "seek" || member.action.kind === "wander");
  const mood = member !== undefined ? moodOf(member.needs) : null;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (groupRef.current !== null) {
      groupRef.current.position.y = moving ? 0 : Math.sin(t * 1.6 + phase) * 0.02;
    }
  });

  if (plan === null) return null;

  const color = bodyColor(plan, 58);
  const emissive = mood !== null ? MOOD_COLORS[mood.tier] : "#000000";
  const emissiveIntensity = mood !== null ? 0.1 + (mood.score / 100) * 0.35 : 0.08;
  const scale = bodyScale(plan);
  const eyeHeight = ALIEN_HEIGHT * 0.92;
  const eyeR = ALIEN_HEIGHT * 0.045;
  const eyes = Array.from({ length: plan.eyeCount }, (_, i) => {
    const spread = (i - (plan.eyeCount - 1) / 2) * eyeR * 3.4;
    return (
      <mesh key={i} position={[spread, eyeHeight, ALIEN_HEIGHT * 0.14]}>
        <sphereGeometry args={[eyeR, 8, 8]} />
        <meshStandardMaterial color="#10121f" emissive="#c8f5ff" emissiveIntensity={0.6} />
      </mesh>
    );
  });

  return (
    <group ref={groupRef}>
      {meshUrl !== null ? (
        <ModelErrorBoundary>
          <Suspense fallback={null}>
            <AlienModel
              meshUrl={meshUrl}
              instanceId={entity.id}
              scale={scale}
              color={color}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity}
            />
          </Suspense>
        </ModelErrorBoundary>
      ) : (
        <mesh scale={scale} position={[0, ALIEN_HEIGHT * 0.5, 0]}>
          <capsuleGeometry args={[0.28, ALIEN_HEIGHT * 0.55, 6, 10]} />
          <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={emissiveIntensity} />
        </mesh>
      )}
      {eyes}
    </group>
  );
}
