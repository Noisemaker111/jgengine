/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "@jgengine/core/ui/jsx";
import { CapsuleGeometry, Group, MathUtils, MeshStandardMaterial, SphereGeometry, Vector3 } from "three";

import { advanceGaitPhase, gaitBobOffset, gaitSwayAngle } from "@jgengine/core/movement/avatarGait";
import {
  EngineDrawMount,
  SceneObjectPortal,
  meshDraw,
  useSceneObjectAttach,
} from "@jgengine/core/frame/useEngineDraw.draw";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";
import { PlayerCharacterFigure } from "../../user/components/PlayerCharacterFigure";
import { DEFAULT_CHARACTER_LOOK } from "../../user/playerCharacterFigure";
import { REMOTE_AVATAR_INTERPOLATION_MS } from "../../world/location";
import { readLiveRemotePose, sampleRemotePose } from "../../world/remotePresenceRuntime";
import { worldLabels } from "../../scene/worldLabels";

const AIRBORNE_JUMP_Y = 0.04;

interface WorldAgentAvatarProps {
  presenceId: string;
  label: string | null;
  kind?: "human" | "bot" | undefined;
  online?: boolean;
}

function lerpAngle(from: number, to: number, alpha: number): number {
  const delta = MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI;
  return from + delta * alpha;
}

/** A positioned scene group attached to the engine loop. */
function useAvatarGroup(initial?: { position: readonly [number, number, number]; rotationY: number }): Group {
  const group = useMemo(() => {
    const next = new Group();
    if (initial !== undefined) {
      next.position.set(initial.position[0], initial.position[1], initial.position[2]);
      next.rotation.y = initial.rotationY;
    }
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useSceneObjectAttach(group);
  return group;
}

/** Registers this avatar's nameplate with the HUD and keeps it over the anchor's head every frame. */
function Nameplate({ anchor, localY, displayName, online }: { anchor: Group; localY: number; displayName: string; online: boolean }) {
  const id = useMemo(() => `avatar:${Math.random().toString(36).slice(2)}`, []);
  useEffect(() => {
    worldLabels.set({ id, text: `${displayName.toUpperCase()}${online ? "" : " · AFK"}`, color: online ? "#f4ecdd" : "#a1a1aa", border: online ? "#5fc2a866" : "#71717a80", position: [anchor.position.x, anchor.position.y + localY, anchor.position.z] });
  }, [id, anchor, displayName, online, localY]);
  useEffect(() => () => worldLabels.remove(id), [id]);
  useFrameTask(function nameplate() {
    anchor.getWorldPosition(scratch);
    worldLabels.move(id, scratch.x, scratch.y + localY, scratch.z);
  });
  return null;
}

const scratch = new Vector3();

function AvatarMesh({
  label,
  kind = "bot",
  online = true,
  isWalking = false,
  headLookRef,
}: {
  label: string | null;
  kind?: "human" | "bot" | undefined;
  online?: boolean;
  isWalking?: boolean;
  headLookRef?: MutableRefObject<{ pitch: number } | null> | undefined;
}) {
  const displayName = label?.trim() || (kind === "human" ? "Player" : "Bot");
  // Bots never show AFK; a human's plate greys out while their lab's owner is away.
  const shownOnline = kind !== "human" || online;
  const anchor = useAvatarGroup();

  if (kind === "human") {
    return (
      <SceneObjectPortal object={anchor}>
        <PlayerCharacterFigure look={DEFAULT_CHARACTER_LOOK} isWalking={isWalking} headLookRef={headLookRef} />
        <Nameplate anchor={anchor} localY={1.75} displayName={displayName} online={shownOnline} />
      </SceneObjectPortal>
    );
  }

  return (
    <SceneObjectPortal object={anchor}>
      <EngineDrawMount
        create={() =>
          meshDraw({
            geometry: new CapsuleGeometry(0.32, 0.9, 6, 12),
            material: new MeshStandardMaterial({
              color: "#5fc2a8",
              emissive: "#3c8c76",
              emissiveIntensity: 0.12,
              roughness: 0.9,
              metalness: 0,
            }),
            position: [0, 0.9, 0],
            castShadow: true,
          })
        }
        deps={[]}
      />
      <EngineDrawMount
        create={() =>
          meshDraw({
            geometry: new SphereGeometry(0.28, 12, 12),
            material: new MeshStandardMaterial({ color: "#7a9e8e", roughness: 0.9, metalness: 0 }),
            position: [0, 1.55, 0],
            castShadow: true,
          })
        }
        deps={[]}
      />
      <Nameplate anchor={anchor} localY={2.2} displayName={displayName} online={shownOnline} />
    </SceneObjectPortal>
  );
}

function DormantWorldAgentAvatar({
  presenceId,
  label,
  kind,
}: WorldAgentAvatarProps) {
  const live = readLiveRemotePose(presenceId);
  const group = useAvatarGroup(
    live !== undefined && live !== null
      ? { position: [live.position.x, live.position.y, live.position.z], rotationY: live.rotationY }
      : undefined,
  );
  const inner = useAvatarGroup();
  useMemo(() => {
    inner.scale.setScalar(0.92);
    return undefined;
  }, [inner]);

  useFrameTask(function remoteAvatar() {
    const pose = readLiveRemotePose(presenceId);
    if (!pose) return;
    group.position.set(pose.position.x, pose.position.y, pose.position.z);
    group.rotation.y = pose.rotationY;
  });

  return (
    <SceneObjectPortal object={group}>
      <SceneObjectPortal object={inner}>
        <AvatarMesh label={label} kind={kind} online={false} isWalking={false} />
      </SceneObjectPortal>
    </SceneObjectPortal>
  );
}

function LiveQueryDrivenWorldAgentAvatar({
  presenceId,
  label,
  kind,
}: WorldAgentAvatarProps) {
  const group = useAvatarGroup();
  const gait = useAvatarGroup();
  const headLookRef = useRef<{ pitch: number }>({ pitch: 0 });
  const initializedRef = useRef(false);
  const walkingRef = useRef(false);
  const gaitPhaseRef = useRef(0);
  const [isWalking, setIsWalking] = useState(false);

  useFrameTask(function remoteAvatar(_, delta) {
    const sample = sampleRemotePose(presenceId, performance.now());
    if (!sample) return;

    const targetYaw = sample.rotationY;

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

    if (walking) {
      gaitPhaseRef.current = advanceGaitPhase(gaitPhaseRef.current, sample.speedUnitsPerSec, delta);
      gait.position.y = gaitBobOffset(gaitPhaseRef.current, sample.speedUnitsPerSec);
      gait.rotation.z = gaitSwayAngle(gaitPhaseRef.current, sample.speedUnitsPerSec);
    } else {
      gaitPhaseRef.current = 0;
      gait.position.y = MathUtils.lerp(gait.position.y, 0, smoothing);
      gait.rotation.z = MathUtils.lerp(gait.rotation.z, 0, smoothing);
    }
  });

  return (
    <SceneObjectPortal object={group}>
      <SceneObjectPortal object={gait}>
        <AvatarMesh label={label} kind={kind} isWalking={isWalking} headLookRef={headLookRef} />
      </SceneObjectPortal>
    </SceneObjectPortal>
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
