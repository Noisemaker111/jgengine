import { Html } from "@react-three/drei";
import { PROFILE_SECTION, useProfiledFrame } from "@/runtime/runtimePerformanceProfiler";
import { useRef, useState, type MutableRefObject } from "react";
import { Group, MathUtils } from "three";

import { advanceGaitPhase, gaitBobOffset, gaitSwayAngle } from "@jgengine/core/movement/avatarGait";
import { cameraYawToAvatarBodyYaw } from "@jgengine/core/movement/movementModel";
import { PlayerCharacterFigure } from "@/user/components/PlayerCharacterFigure";
import { DEFAULT_CHARACTER_LOOK } from "@/user/playerCharacterFigure";
import { REMOTE_AVATAR_INTERPOLATION_MS } from "@/world/location";
import { readLiveRemotePose, sampleRemotePose } from "@/world/remotePresenceRuntime";

const AIRBORNE_JUMP_Y = 0.04;

interface WorldAgentAvatarProps {
  presenceId: string;
  label: string | null;
  kind?: "human" | "bot";
  online?: boolean;
}

function lerpAngle(from: number, to: number, alpha: number): number {
  const delta = MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI;
  return from + delta * alpha;
}


function AvatarMesh({
  label,
  kind = "bot",
  online = true,
  isWalking = false,
  headLookRef,
}: {
  label: string | null;
  kind?: "human" | "bot";
  online?: boolean;
  isWalking?: boolean;
  headLookRef?: MutableRefObject<{ pitch: number } | null>;
}) {
  const displayName = label?.trim() || (kind === "human" ? "Player" : "Bot");
  const badgeClass =
    kind === "human"
      ? online
        ? "border-brand-teal/40 text-brand-cream"
        : "border-zinc-500/50 text-zinc-400"
      : "border-brand-teal/40 text-brand-cream";
  const badgeSuffix = online ? "" : " · AFK";

  if (kind === "human") {
    return (
      <group>
        <PlayerCharacterFigure look={DEFAULT_CHARACTER_LOOK} isWalking={isWalking} headLookRef={headLookRef} />
        <Html position={[0, 1.75, 0]} center distanceFactor={12} pointerEvents="none" style={{ pointerEvents: "none" }}>
          <div
            className={`rounded-md border bg-[#1f2b28]/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeClass}`}
          >
            {displayName}
            {badgeSuffix}
          </div>
        </Html>
      </group>
    );
  }

  const bodyColor = "#5fc2a8";
  const headColor = "#7a9e8e";

  return (
    <>
      <mesh position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.32, 0.9, 6, 12]} />
        <meshStandardMaterial
          color={bodyColor}
          emissive="#3c8c76"
          emissiveIntensity={0.12}
          roughness={0.9}
          metalness={0}
        />
      </mesh>
      <mesh position={[0, 1.55, 0]} castShadow>
        <sphereGeometry args={[0.28, 12, 12]} />
        <meshStandardMaterial color={headColor} roughness={0.9} metalness={0} />
      </mesh>
      <Html position={[0, 2.2, 0]} center distanceFactor={12} pointerEvents="none" style={{ pointerEvents: "none" }}>
        <div
          className={`rounded-md border bg-[#1f2b28]/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeClass}`}
        >
          {displayName}
        </div>
      </Html>
    </>
  );
}

function DormantWorldAgentAvatar({
  presenceId,
  label,
  kind,
}: WorldAgentAvatarProps) {
  const groupRef = useRef<Group>(null);
  useProfiledFrame(PROFILE_SECTION.agentAvatar, () => {
    const pose = readLiveRemotePose(presenceId);
    if (!pose || !groupRef.current) return;
    groupRef.current.position.set(pose.position.x, pose.position.y, pose.position.z);
    groupRef.current.rotation.y = cameraYawToAvatarBodyYaw(pose.rotationY);
  });
  const live = readLiveRemotePose(presenceId);
  const position = live?.position ?? { x: 0, y: 0, z: 0 };
  const rotationY = cameraYawToAvatarBodyYaw(live?.rotationY ?? 0);

  return (
    <group ref={groupRef} position={[position.x, position.y, position.z]} rotation-y={rotationY}>
      <group scale={0.92}>
        <AvatarMesh label={label} kind={kind} online={false} isWalking={false} />
      </group>
    </group>
  );
}

function LiveQueryDrivenWorldAgentAvatar({
  presenceId,
  label,
  kind,
}: WorldAgentAvatarProps) {
  const groupRef = useRef<Group>(null);
  const gaitGroupRef = useRef<Group>(null);
  const headLookRef = useRef<{ pitch: number }>({ pitch: 0 });
  const initializedRef = useRef(false);
  const walkingRef = useRef(false);
  const gaitPhaseRef = useRef(0);
  const [isWalking, setIsWalking] = useState(false);

  useProfiledFrame(PROFILE_SECTION.agentAvatar, (_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const sample = sampleRemotePose(presenceId, performance.now());
    if (!sample) return;

    const targetYaw = cameraYawToAvatarBodyYaw(sample.rotationY);

    if (!initializedRef.current) {
      group.position.set(sample.position.x, sample.position.y, sample.position.z);
      group.rotation.y = targetYaw;
      headLookRef.current.pitch = sample.rotationPitch;
      initializedRef.current = true;
      return;
    }

    const smoothing = Math.min(1, (delta * 1000) / REMOTE_AVATAR_INTERPOLATION_MS);
    group.position.x = MathUtils.lerp(group.position.x, sample.position.x, smoothing);
    group.position.y = MathUtils.lerp(group.position.y, sample.position.y, smoothing);
    group.position.z = MathUtils.lerp(group.position.z, sample.position.z, smoothing);
    group.rotation.y = lerpAngle(group.rotation.y, targetYaw, smoothing);
    headLookRef.current.pitch = MathUtils.lerp(headLookRef.current.pitch, sample.rotationPitch, smoothing);

    const airborne = sample.position.y > AIRBORNE_JUMP_Y;
    const walking = sample.moving && !airborne;
    if (walking !== walkingRef.current) {
      walkingRef.current = walking;
      setIsWalking(walking);
    }

    const gaitGroup = gaitGroupRef.current;
    if (gaitGroup) {
      if (walking) {
        gaitPhaseRef.current = advanceGaitPhase(gaitPhaseRef.current, sample.speedUnitsPerSec, delta);
        gaitGroup.position.y = gaitBobOffset(gaitPhaseRef.current, sample.speedUnitsPerSec);
        gaitGroup.rotation.z = gaitSwayAngle(gaitPhaseRef.current, sample.speedUnitsPerSec);
      } else {
        gaitPhaseRef.current = 0;
        gaitGroup.position.y = MathUtils.lerp(gaitGroup.position.y, 0, smoothing);
        gaitGroup.rotation.z = MathUtils.lerp(gaitGroup.rotation.z, 0, smoothing);
      }
    }
  });

  return (
    <group ref={groupRef}>
      <group ref={gaitGroupRef}>
        <AvatarMesh label={label} kind={kind} isWalking={isWalking} headLookRef={headLookRef} />
      </group>
    </group>
  );
}

export function InterpolatedWorldAgentAvatar({
  online = true,
  ...props
}: WorldAgentAvatarProps) {
  if (!online) {
    return <DormantWorldAgentAvatar {...props} online={false} />;
  }
  return <LiveQueryDrivenWorldAgentAvatar {...props} />;
}
