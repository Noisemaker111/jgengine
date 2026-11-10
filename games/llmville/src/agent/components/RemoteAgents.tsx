/** @jsxImportSource @jgengine/core/ui/jsx */
import { useQuery } from "convex/react";
import { useEffect, useLayoutEffect, useMemo, useState } from "@jgengine/core/ui/jsx";

import type { RemotePlayersProps } from "@jgengine/core/game/playableGame";
import { cameraYawToAvatarBodyYaw } from "@jgengine/core/movement/movementModel";
import type { PresencePoseRow } from "@jgengine/core/runtime/transport";
import { api } from "@llmville/backend/convex/_generated/api";
import { worldChunkKeyAt } from "@llmville/game/datacenter/worldChunks";
import { InterpolatedWorldAgentAvatar } from "@/agent/components/WorldAgentAvatar";
import { useGameEngineState, type GameEngine } from "@/runtime/gameEngine";
import { useWorldSceneProps } from "@/runtime/llmvilleSession";
import { setNearbyPlayers } from "@/runtime/localPlayerEntity";
import { readPlayerPosition } from "@/runtime/playerPosition";
import { REMOTE_AVATAR_RENDER_CAP } from "@/world/location";
import { publishLiveRemotePoses, type LiveRemotePose } from "@/world/remotePresenceRuntime";

type Resident = NonNullable<ReturnType<typeof useQuery<typeof api.multiplayer.worldPresence.cityResidents>>>[number];

function onlinePose(row: PresencePoseRow, receivedAt: number): LiveRemotePose {
  return {
    presenceId: row.sessionId ?? row.userId,
    actorExternalId: row.userId,
    label: row.label ?? null,
    kind: row.kind === "bot" ? "bot" : "human",
    online: true,
    position: row.position,
    rotationY: row.rotationY,
    rotationPitch: row.rotationPitch,
    receivedAt,
  };
}

function dormantPose(resident: Resident, receivedAt: number): LiveRemotePose {
  return {
    presenceId: resident.presenceId,
    actorExternalId: resident.actorExternalId,
    label: resident.label,
    kind: resident.kind,
    online: false,
    position: resident.position,
    rotationY: cameraYawToAvatarBodyYaw(resident.rotationY),
    rotationPitch: resident.rotationPitch ?? 0,
    receivedAt,
  };
}

/**
 * `scene.RemotePlayers`: the shell's presence rows plus the labs whose owners are offline, standing
 * where they last were. Draws the nearest few, and other players block the local player's step.
 */
export function LlmvilleRemotePlayers({ ctx, rows }: RemotePlayersProps) {
  const scene = useWorldSceneProps();
  return scene === null ? null : <RemoteAgents ctx={ctx} rows={rows} engine={scene.engine} />;
}

function RemoteAgents({ ctx, rows, engine }: RemotePlayersProps & { engine: GameEngine }) {
  const selfId = ctx.player.userId;
  const viewerChunkKey = useGameEngineState(engine, (state) => worldChunkKeyAt(state.player.position));
  const residents = useQuery(api.multiplayer.worldPresence.cityResidents, { viewerChunkKey });

  const poses = useMemo(() => {
    const receivedAt = performance.now();
    const seen = new Set<string>();
    const all: LiveRemotePose[] = [];
    for (const row of rows) {
      if (row.userId === selfId || seen.has(row.userId)) continue;
      seen.add(row.userId);
      all.push(onlinePose(row, receivedAt));
    }
    for (const resident of residents ?? []) {
      if (resident.actorExternalId === selfId || seen.has(resident.actorExternalId) || seen.has(resident.ownerActorId)) continue;
      seen.add(resident.actorExternalId);
      all.push(dormantPose(resident, receivedAt));
    }
    return all;
  }, [rows, residents, selfId]);

  // Every delivery republishes, so the frame loop interpolates between the latest two poses.
  useLayoutEffect(() => publishLiveRemotePoses(poses), [poses]);
  useEffect(() => () => publishLiveRemotePoses([]), []);

  useEffect(() => {
    setNearbyPlayers(ctx, poses.filter((pose) => pose.online).map((pose) => ({ x: pose.position.x, z: pose.position.z })));
  }, [ctx, poses]);
  useEffect(() => () => setNearbyPlayers(ctx, []), [ctx]);

  const [drawn, setDrawn] = useState<readonly LiveRemotePose[]>([]);
  useEffect(() => {
    const recompute = () => {
      const player = readPlayerPosition(engine);
      const next = poses
        .map((pose) => ({ pose, distanceSq: (pose.position.x - player.x) ** 2 + (pose.position.z - player.z) ** 2 }))
        .sort((a, b) => a.distanceSq - b.distanceSq)
        .slice(0, REMOTE_AVATAR_RENDER_CAP)
        .map(({ pose }) => pose);
      setDrawn((current) =>
        current.length === next.length && current.every((pose, index) => pose.presenceId === next[index]?.presenceId && pose.online === next[index]?.online && pose.label === next[index]?.label)
          ? current
          : next);
    };
    recompute();
    return engine.subscribe(recompute);
  }, [engine, poses]);

  return (
    <>
      {drawn.map((pose) => (
        <InterpolatedWorldAgentAvatar key={pose.presenceId} presenceId={pose.presenceId} label={pose.label} kind={pose.kind} online={pose.online} />
      ))}
    </>
  );
}
