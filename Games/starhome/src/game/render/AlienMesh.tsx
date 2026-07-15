import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group } from "three";

import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { useStore } from "@jgengine/react/store";

import { bodyColor, type AlienBodyPlan } from "../creatures/bodyPlan";
import { moodOf } from "../needs/needs";
import { MOOD_COLORS } from "../palette";
import { householdStore } from "../session/store";

function planOf(entity: SceneEntity): AlienBodyPlan | null {
  const meta = entity.meta as { bodyPlan?: AlienBodyPlan } | null;
  return meta?.bodyPlan ?? null;
}

function hash(id: string): number {
  let a = 0;
  for (let i = 0; i < id.length; i++) a = (a * 31 + id.charCodeAt(i)) >>> 0;
  return a;
}

export function AlienMesh({ entity }: { entity: SceneEntity }): React.ReactNode {
  const plan = planOf(entity);
  const household = useStore(householdStore);
  const groupRef = useRef<Group>(null);
  const limbsRef = useRef<Group>(null);
  const phase = useMemo(() => (hash(entity.id) % 628) / 100, [entity.id]);

  const member = household.members[entity.id];
  const moving = member !== undefined && (member.action.kind === "seek" || member.action.kind === "wander");
  const mood = member !== undefined ? moodOf(member.needs) : null;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (groupRef.current !== null) {
      groupRef.current.position.y = 0.02 + Math.sin(t * 2.2 + phase) * 0.05;
    }
    if (limbsRef.current !== null) {
      limbsRef.current.rotation.y = moving ? Math.sin(t * 6 + phase) * 0.18 : Math.sin(t * 1.2 + phase) * 0.04;
    }
  });

  if (plan === null) return null;

  const s = plan.size;
  const bodyR = 0.52 * s;
  const bodyY = bodyHeight(plan) * bodyR;
  const color = bodyColor(plan, 58);
  const emissive = mood !== null ? MOOD_COLORS[mood.tier] : "#000000";
  const emissiveIntensity = mood !== null ? 0.12 + (mood.score / 100) * 0.4 : 0.15;

  const limbs = Array.from({ length: plan.limbCount }, (_, i) => {
    const a = (i / plan.limbCount) * Math.PI * 2;
    const reach = bodyR * (0.9 + plan.limbLength);
    return (
      <mesh
        key={i}
        position={[Math.cos(a) * bodyR * 0.8, -bodyY * 0.35, Math.sin(a) * bodyR * 0.8]}
        rotation={[0, -a, Math.PI / 2.4]}
      >
        <cylinderGeometry args={[0.045 * s, 0.06 * s, reach, 6]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
    );
  });

  const eyes = Array.from({ length: plan.eyeCount }, (_, i) => {
    const spread = (i - (plan.eyeCount - 1) / 2) * 0.16 * s;
    return (
      <mesh key={i} position={[spread, bodyY * 0.55 + bodyR * 0.7, bodyR * 0.9]}>
        <sphereGeometry args={[0.06 * s, 8, 8]} />
        <meshStandardMaterial color="#10121f" emissive="#c8f5ff" emissiveIntensity={0.5} />
      </mesh>
    );
  });

  return (
    <group ref={groupRef} position={[0, bodyY, 0]}>
      <group ref={limbsRef}>{limbs}</group>
      <mesh scale={bodyScale(plan)}>
        <sphereGeometry args={[bodyR, 16, 16]} />
        <meshStandardMaterial
          color={color}
          roughness={0.55}
          metalness={0.05}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
        />
      </mesh>
      {plan.shape === "insectoid" ? (
        <mesh position={[0, bodyY * 0.2, -bodyR * 0.8]} scale={[0.7, 0.7, 1]}>
          <sphereGeometry args={[bodyR * 0.7, 12, 12]} />
          <meshStandardMaterial color={bodyColor(plan, 48)} roughness={0.6} />
        </mesh>
      ) : null}
      {eyes}
    </group>
  );
}

function bodyHeight(plan: AlienBodyPlan): number {
  switch (plan.shape) {
    case "tall":
      return 2.1;
    case "blob":
      return 1.1;
    case "insectoid":
      return 1.2;
    default:
      return 1.4;
  }
}

function bodyScale(plan: AlienBodyPlan): [number, number, number] {
  switch (plan.shape) {
    case "tall":
      return [0.7, 1.7, 0.7];
    case "blob":
      return [1.25, 0.85, 1.25];
    case "insectoid":
      return [0.85, 0.9, 1.15];
    default:
      return [1, 1, 1];
  }
}
