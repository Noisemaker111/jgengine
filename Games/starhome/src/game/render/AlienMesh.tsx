import { useFrame, useLoader } from "@react-three/fiber";
import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { hashString } from "@jgengine/core/random/rng";
import { cloneModelScene, disposeClonedMaterials, standardMaterialsOf } from "@jgengine/shell/render/modelRender";
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
  scale,
  color,
  emissive,
  emissiveIntensity,
  moving,
}: {
  meshUrl: string;
  scale: [number, number, number];
  color: string;
  emissive: string;
  emissiveIntensity: number;
  moving: boolean;
}): ReactNode {
  const gltf = useLoader(GLTFLoader, meshUrl, (loader) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
  });

  const scene = useMemo(() => cloneModelScene(gltf.scene), [gltf]);
  const materials = useMemo(() => standardMaterialsOf(scene), [scene]);
  const normalizedScale = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const height = box.max.y - box.min.y;
    return Number.isFinite(height) && height > 0 ? ALIEN_HEIGHT / height : 1;
  }, [scene]);

  useEffect(() => () => disposeClonedMaterials(scene), [scene]);

  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<{ idle: THREE.AnimationAction; walk: THREE.AnimationAction; active: "idle" | "walk" } | null>(
    null,
  );

  useEffect(() => {
    if (gltf.animations.length === 0) {
      mixerRef.current = null;
      actionsRef.current = null;
      return;
    }
    const mixer = new THREE.AnimationMixer(scene);
    const clipFor = (name: string) => THREE.AnimationClip.findByName(gltf.animations, name) ?? gltf.animations[0]!;
    const idle = mixer.clipAction(clipFor("idle"));
    const walk = mixer.clipAction(clipFor("walk"));
    for (const action of [idle, walk]) {
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.enabled = true;
    }
    idle.play();
    mixer.update(0);
    mixerRef.current = mixer;
    actionsRef.current = { idle, walk, active: "idle" };
    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
      actionsRef.current = null;
    };
  }, [scene, gltf]);

  useEffect(() => {
    for (const material of materials) {
      material.color.set(color);
      material.emissive.set(emissive);
      material.emissiveIntensity = emissiveIntensity;
    }
  }, [materials, color, emissive, emissiveIntensity]);

  useFrame((_state, delta) => {
    const machine = actionsRef.current;
    if (machine !== null) {
      const next: "idle" | "walk" = moving ? "walk" : "idle";
      if (next !== machine.active) {
        machine[next].reset().fadeIn(0.25).play();
        machine[machine.active].fadeOut(0.25);
        machine.active = next;
      }
    }
    if (mixerRef.current !== null) mixerRef.current.update(delta);
  });

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
  const phase = useMemo(() => (hashString(entity.id) % 628) / 100, [entity.id]);
  const meshUrl = useMemo(() => resolveAlienMeshUrl(hashString(entity.id)), [entity.id]);

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
              scale={scale}
              color={color}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity}
              moving={moving}
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
