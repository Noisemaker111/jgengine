import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { ReactNode } from "react";
import { attackAnimAt } from "../entities/enemies/ai";
import { enemyById } from "../entities/enemies/catalog";

const OUTLINE = "#16130f";

function hashPhase(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return (Math.abs(hash) % 628) / 100;
}

function attackPulse(id: string, nowMs: number, durationMs = 320): number {
  const at = attackAnimAt.get(id);
  if (at === undefined) return 0;
  const t = (nowMs - at) / durationMs;
  if (t < 0 || t > 1) return 0;
  return Math.sin(t * Math.PI);
}

interface RigProps {
  entity: SceneEntity;
  scale: number;
}

function useGait(entityId: string) {
  const root = useRef<Group>(null);
  const gait = useRef({ speed: 0, lastX: 0, lastZ: 0, initialized: false });
  const readGait = (dt: number): number => {
    const group = root.current?.parent;
    if (group === null || group === undefined || dt <= 0) return gait.current.speed;
    const { x, z } = group.position;
    if (!gait.current.initialized) {
      gait.current.lastX = x;
      gait.current.lastZ = z;
      gait.current.initialized = true;
      return 0;
    }
    const speed = Math.hypot(x - gait.current.lastX, z - gait.current.lastZ) / dt;
    gait.current.lastX = x;
    gait.current.lastZ = z;
    gait.current.speed = gait.current.speed * 0.85 + speed * 0.15;
    return gait.current.speed;
  };
  return { root, readGait, phase: hashPhase(entityId) };
}

function Limb({ x, y, z, w, h, d, color, rotX = 0 }: { x: number; y: number; z: number; w: number; h: number; d: number; color: string; rotX?: number }) {
  return (
    <group position={[x, y, z]} rotation={[rotX, 0, 0]}>
      <mesh position={[0, -h / 2, 0]} castShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
    </group>
  );
}

export function BanditRig({ entity, scale }: RigProps) {
  const { root, readGait, phase } = useGait(entity.id);
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const leftLeg = useRef<Group>(null);
  const rightLeg = useRef<Group>(null);
  const torso = useRef<Group>(null);
  const def = enemyById(entity.name);
  const isPsycho = entity.name.includes("psycho");
  const body = isPsycho ? "#c96f3b" : entity.name === "nomad" ? "#7a6a4a" : "#6f5a3e";
  const accent = def?.badass === true ? "#ffb400" : isPsycho ? "#e23c2e" : "#3a4450";

  useFrame((state, dt) => {
    const nowMs = state.clock.elapsedTime * 1000;
    const speed = readGait(dt);
    const t = state.clock.elapsedTime * 7 + phase;
    const swing = Math.min(1, speed / 4) * 0.8;
    const lunge = attackPulse(entity.id, nowMs);
    if (leftLeg.current) leftLeg.current.rotation.x = Math.sin(t) * swing;
    if (rightLeg.current) rightLeg.current.rotation.x = -Math.sin(t) * swing;
    if (leftArm.current) leftArm.current.rotation.x = -Math.sin(t) * swing * 0.7;
    if (rightArm.current) {
      rightArm.current.rotation.x = isPsycho
        ? -0.6 - lunge * 1.8 + Math.sin(t) * swing * 0.3
        : -1.35 + lunge * 0.25;
    }
    if (torso.current) {
      torso.current.position.y = 0.62 * scale + Math.abs(Math.sin(t)) * 0.03 * scale;
      torso.current.rotation.x = lunge * (isPsycho ? 0.35 : 0.08);
    }
  });

  const s = scale;
  return (
    <group ref={root}>
      <group ref={torso} position={[0, 0.62 * s, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.5 * s, 0.62 * s, 0.3 * s]} />
          <meshStandardMaterial color={body} flatShading />
        </mesh>
        <mesh position={[0, 0.12 * s, 0.16 * s]}>
          <boxGeometry args={[0.34 * s, 0.2 * s, 0.02 * s]} />
          <meshStandardMaterial color={accent} flatShading />
        </mesh>
        <group position={[0, 0.5 * s, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.3 * s, 0.3 * s, 0.28 * s]} />
            <meshStandardMaterial color={isPsycho ? "#e8e4da" : "#c9b8a0"} flatShading />
          </mesh>
          <mesh position={[0.07 * s, 0.03 * s, 0.15 * s]}>
            <boxGeometry args={[0.05 * s, 0.05 * s, 0.02 * s]} />
            <meshStandardMaterial color={OUTLINE} />
          </mesh>
          <mesh position={[-0.07 * s, 0.03 * s, 0.15 * s]}>
            <boxGeometry args={[0.05 * s, 0.05 * s, 0.02 * s]} />
            <meshStandardMaterial color={OUTLINE} />
          </mesh>
          {isPsycho ? (
            <mesh position={[0, 0.2 * s, 0]}>
              <boxGeometry args={[0.32 * s, 0.06 * s, 0.3 * s]} />
              <meshStandardMaterial color={accent} flatShading />
            </mesh>
          ) : (
            <mesh position={[0, 0.1 * s, 0.12 * s]}>
              <boxGeometry args={[0.32 * s, 0.1 * s, 0.1 * s]} />
              <meshStandardMaterial color={"#20242c"} flatShading />
            </mesh>
          )}
        </group>
        <group ref={leftArm} position={[-0.32 * s, 0.24 * s, 0]}>
          <Limb x={0} y={0} z={0} w={0.14 * s} h={0.5 * s} d={0.14 * s} color={body} />
        </group>
        <group ref={rightArm} position={[0.32 * s, 0.24 * s, 0]}>
          <Limb x={0} y={0} z={0} w={0.14 * s} h={0.5 * s} d={0.14 * s} color={body} />
          <mesh position={[0, -0.5 * s, 0.12 * s]} castShadow>
            {isPsycho ? <boxGeometry args={[0.06 * s, 0.34 * s, 0.16 * s]} /> : <boxGeometry args={[0.08 * s, 0.1 * s, 0.5 * s]} />}
            <meshStandardMaterial color={isPsycho ? "#c8c8c8" : "#2c3138"} flatShading />
          </mesh>
        </group>
      </group>
      <group ref={leftLeg} position={[-0.14 * s, 0.34 * s, 0]}>
        <Limb x={0} y={0} z={0} w={0.16 * s} h={0.34 * s} d={0.16 * s} color={"#3a332c"} />
      </group>
      <group ref={rightLeg} position={[0.14 * s, 0.34 * s, 0]}>
        <Limb x={0} y={0} z={0} w={0.16 * s} h={0.34 * s} d={0.16 * s} color={"#3a332c"} />
      </group>
    </group>
  );
}

export function SkagRig({ entity, scale }: RigProps) {
  const { root, readGait, phase } = useGait(entity.id);
  const jaw = useRef<Group>(null);
  const bodyRef = useRef<Group>(null);
  const legs = [useRef<Group>(null), useRef<Group>(null), useRef<Group>(null), useRef<Group>(null)];
  const def = enemyById(entity.name);
  const isMong = entity.name.includes("bullymong");
  const body = isMong ? "#71828f" : entity.name === "badass_skag" ? "#7d6844" : "#9a8258";
  const accent = def?.badass === true ? "#e2582e" : "#6b5636";

  useFrame((state, dt) => {
    const nowMs = state.clock.elapsedTime * 1000;
    const speed = readGait(dt);
    const t = state.clock.elapsedTime * 9 + phase;
    const swing = Math.min(1, speed / 4.5) * 0.7;
    const bite = attackPulse(entity.id, nowMs, 260);
    legs.forEach((leg, index) => {
      if (leg.current) leg.current.rotation.x = Math.sin(t + (index % 2 === 0 ? 0 : Math.PI)) * swing;
    });
    if (jaw.current) jaw.current.rotation.x = 0.15 + bite * 0.85;
    if (bodyRef.current) {
      bodyRef.current.position.y = 0.42 * scale + Math.abs(Math.sin(t)) * 0.02 * scale;
      bodyRef.current.rotation.x = -bite * 0.2;
    }
  });

  const s = scale;
  return (
    <group ref={root}>
      <group ref={bodyRef} position={[0, 0.42 * s, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.55 * s, 0.4 * s, 0.9 * s]} />
          <meshStandardMaterial color={body} flatShading />
        </mesh>
        <mesh position={[0, 0.24 * s, -0.1 * s]} castShadow>
          <boxGeometry args={[0.4 * s, 0.14 * s, 0.5 * s]} />
          <meshStandardMaterial color={accent} flatShading />
        </mesh>
        <group position={[0, 0.05 * s, 0.5 * s]}>
          <mesh castShadow>
            <boxGeometry args={[0.42 * s, 0.3 * s, 0.34 * s]} />
            <meshStandardMaterial color={body} flatShading />
          </mesh>
          <mesh position={[0.12 * s, 0.1 * s, 0.16 * s]}>
            <boxGeometry args={[0.05 * s, 0.05 * s, 0.03 * s]} />
            <meshStandardMaterial color="#ffb400" emissive="#ffb400" emissiveIntensity={0.6} />
          </mesh>
          <mesh position={[-0.12 * s, 0.1 * s, 0.16 * s]}>
            <boxGeometry args={[0.05 * s, 0.05 * s, 0.03 * s]} />
            <meshStandardMaterial color="#ffb400" emissive="#ffb400" emissiveIntensity={0.6} />
          </mesh>
          <group ref={jaw} position={[0, -0.12 * s, 0.05 * s]}>
            <mesh position={[0, -0.05 * s, 0.16 * s]} castShadow>
              <boxGeometry args={[0.38 * s, 0.1 * s, 0.34 * s]} />
              <meshStandardMaterial color={"#efe7d8"} flatShading />
            </mesh>
          </group>
        </group>
      </group>
      {[
        [-0.22, 0.32],
        [0.22, 0.32],
        [-0.22, -0.32],
        [0.22, -0.32],
      ].map(([x, z], index) => (
        <group key={index} ref={legs[index]} position={[x! * s, 0.3 * s, z! * s]}>
          <Limb x={0} y={0} z={0} w={0.13 * s} h={0.3 * s} d={0.13 * s} color={body} />
        </group>
      ))}
    </group>
  );
}

export function LoaderRig({ entity, scale }: RigProps) {
  const { root, readGait, phase } = useGait(entity.id);
  const legs = [useRef<Group>(null), useRef<Group>(null)];
  const eye = useRef<Group>(null);
  const def = enemyById(entity.name);
  const body = entity.name === "badass_loader" ? "#8a6a1e" : "#c9a23a";
  const eyeColor = def?.badass === true ? "#3fc9ff" : "#e23c2e";

  useFrame((state, dt) => {
    const speed = readGait(dt);
    const t = state.clock.elapsedTime * 6 + phase;
    const swing = Math.min(1, speed / 3) * 0.6;
    legs.forEach((leg, index) => {
      if (leg.current) leg.current.rotation.x = Math.sin(t + (index === 0 ? 0 : Math.PI)) * swing;
    });
    if (eye.current) eye.current.rotation.y = Math.sin(state.clock.elapsedTime * 2 + phase) * 0.4;
  });

  const s = scale;
  return (
    <group ref={root}>
      <group position={[0, 0.85 * s, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.6 * s, 0.55 * s, 0.4 * s]} />
          <meshStandardMaterial color={body} flatShading />
        </mesh>
        <mesh position={[0, -0.02 * s, 0.21 * s]}>
          <boxGeometry args={[0.5 * s, 0.4 * s, 0.02 * s]} />
          <meshStandardMaterial color="#3a332c" flatShading />
        </mesh>
        <group ref={eye} position={[0, 0.1 * s, 0.22 * s]}>
          <mesh>
            <boxGeometry args={[0.16 * s, 0.16 * s, 0.06 * s]} />
            <meshStandardMaterial color={eyeColor} emissive={eyeColor} emissiveIntensity={1.4} />
          </mesh>
        </group>
        <mesh position={[0.42 * s, -0.05 * s, 0.1 * s]} castShadow>
          <boxGeometry args={[0.14 * s, 0.14 * s, 0.55 * s]} />
          <meshStandardMaterial color="#2c3138" flatShading />
        </mesh>
        <mesh position={[-0.42 * s, -0.05 * s, 0.1 * s]} castShadow>
          <boxGeometry args={[0.14 * s, 0.14 * s, 0.55 * s]} />
          <meshStandardMaterial color="#2c3138" flatShading />
        </mesh>
      </group>
      {[-0.18, 0.18].map((x, index) => (
        <group key={index} ref={legs[index]} position={[x * s, 0.56 * s, 0]}>
          <Limb x={0} y={0} z={0} w={0.16 * s} h={0.56 * s} d={0.2 * s} color="#8a7a52" />
        </group>
      ))}
    </group>
  );
}

export function WarriorRig({ entity, scale }: RigProps) {
  const { root, phase } = useGait(entity.id);
  const core = useRef<Group>(null);
  useFrame((state) => {
    const nowMs = state.clock.elapsedTime * 1000;
    const pulse = 0.8 + Math.sin(state.clock.elapsedTime * 2.4 + phase) * 0.2 + attackPulse(entity.id, nowMs) * 1.2;
    if (core.current) core.current.scale.setScalar(pulse);
    if (root.current) root.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.4 + phase) * 0.12;
  });
  const s = scale;
  return (
    <group ref={root}>
      <mesh position={[0, 0.7 * s, 0]} castShadow>
        <boxGeometry args={[1.5 * s, 1.1 * s, 1.1 * s]} />
        <meshStandardMaterial color="#8a2f1e" flatShading />
      </mesh>
      <mesh position={[0, 1.45 * s, 0.2 * s]} castShadow>
        <boxGeometry args={[0.9 * s, 0.6 * s, 0.7 * s]} />
        <meshStandardMaterial color="#6e2416" flatShading />
      </mesh>
      <mesh position={[0.55 * s, 1.75 * s, 0.1 * s]} rotation={[0, 0, -0.5]}>
        <coneGeometry args={[0.18 * s, 0.6 * s, 4]} />
        <meshStandardMaterial color="#3a1c12" flatShading />
      </mesh>
      <mesh position={[-0.55 * s, 1.75 * s, 0.1 * s]} rotation={[0, 0, 0.5]}>
        <coneGeometry args={[0.18 * s, 0.6 * s, 4]} />
        <meshStandardMaterial color="#3a1c12" flatShading />
      </mesh>
      <group ref={core} position={[0, 0.75 * s, 0.56 * s]}>
        <mesh>
          <boxGeometry args={[0.4 * s, 0.4 * s, 0.1 * s]} />
          <meshStandardMaterial color="#ff9a00" emissive="#ff7a1a" emissiveIntensity={2.2} />
        </mesh>
      </group>
      <mesh position={[0.9 * s, 0.35 * s, 0.3 * s]} castShadow>
        <boxGeometry args={[0.4 * s, 0.7 * s, 0.4 * s]} />
        <meshStandardMaterial color="#6e2416" flatShading />
      </mesh>
      <mesh position={[-0.9 * s, 0.35 * s, 0.3 * s]} castShadow>
        <boxGeometry args={[0.4 * s, 0.7 * s, 0.4 * s]} />
        <meshStandardMaterial color="#6e2416" flatShading />
      </mesh>
    </group>
  );
}

export function ClaptrapRig({ entity }: { entity: SceneEntity }) {
  const { root, phase } = useGait(entity.id);
  const antenna = useRef<Group>(null);
  useFrame((state) => {
    if (antenna.current) antenna.current.rotation.z = Math.sin(state.clock.elapsedTime * 5 + phase) * 0.25;
    if (root.current) root.current.rotation.y = Math.sin(state.clock.elapsedTime * 1.6 + phase) * 0.5;
  });
  return (
    <group ref={root}>
      <mesh position={[0, 0.22, 0]} castShadow>
        <boxGeometry args={[0.42, 0.42, 0.3]} />
        <meshStandardMaterial color="#c9a23a" flatShading />
      </mesh>
      <mesh position={[0, 0.75, 0]} castShadow>
        <boxGeometry args={[0.5, 0.65, 0.4]} />
        <meshStandardMaterial color="#c9a23a" flatShading />
      </mesh>
      <mesh position={[0, 0.82, 0.21]}>
        <boxGeometry args={[0.16, 0.16, 0.04]} />
        <meshStandardMaterial color="#3fc9ff" emissive="#3fc9ff" emissiveIntensity={1.6} />
      </mesh>
      <mesh position={[0, 0.12, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.16, 0.16, 0.1, 12]} />
        <meshStandardMaterial color="#4a4a4a" flatShading />
      </mesh>
      <group ref={antenna} position={[0.18, 1.06, 0]}>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.3, 4]} />
          <meshStandardMaterial color="#20242c" />
        </mesh>
      </group>
    </group>
  );
}

export function renderPandoraEntity(entity: SceneEntity): ReactNode {
  if (entity.name === "claptrap") return <ClaptrapRig entity={entity} />;
  const def = enemyById(entity.name);
  if (def === undefined) return undefined;
  const scale = def.scale;
  if (def.id === "the_warrior") return <WarriorRig entity={entity} scale={scale} />;
  if (def.id.includes("loader")) return <LoaderRig entity={entity} scale={scale} />;
  if (def.family === "skag" ) return <SkagRig entity={entity} scale={scale} />;
  return <BanditRig entity={entity} scale={scale} />;
}
