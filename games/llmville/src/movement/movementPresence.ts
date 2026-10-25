/**
 * Multiplayer presence sync — Convex reactive queries are the read path;
 * local pose uploads run on the R3F frame loop (PresenceSyncController).
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import { engineActions, type GameEngine } from "@/runtime/gameEngine";
import { DOM_EVENT } from "@/movement/movementInput";
import { REMOTE_AVATAR_RENDER_CAP } from "@/world/location";
import { readPlayerPosition } from "@/runtime/playerPosition";
import { publishLiveRemotePoses, type LiveRemotePose } from "@/world/remotePresenceRuntime";
import type { PresenceActions, PresenceFeeds, WorldPresenceRow } from "@/multiplayer/presenceTransport";

interface UseMovementPresenceParams {
  engine: GameEngine;
  playerId: string;
  canViewGame: boolean;
  game: { _id: Id<"games"> } | null | undefined;
  presenceFeeds: PresenceFeeds;
  presenceActions: PresenceActions;
}

interface MovementPresence {
  /** Nearest remote avatars to render, capped for performance. */
  otherWorldPresences: readonly WorldPresenceRow[];
  /** True if another session (other tab/device) took over our presence. */
  hasBeenDisplaced: boolean;
}

export function useMovementPresence({
  engine,
  playerId,
  canViewGame,
  game,
  presenceFeeds,
  presenceActions,
}: UseMovementPresenceParams): MovementPresence {
  const presenceInitializedRef = useRef(false);

  // Presence positions are shared world coordinates end to end — no re-mapping.
  const [otherWorldPresences, setOtherWorldPresences] = useState<readonly WorldPresenceRow[]>([]);
  const onlineWorldPresences = useMemo(() => presenceFeeds.onlinePresences === undefined
    ? undefined
    : [...presenceFeeds.onlinePresences, ...(presenceFeeds.dormantPresences ?? [])],
  [presenceFeeds.onlinePresences, presenceFeeds.dormantPresences]);

  useEffect(() => {
    if (onlineWorldPresences === undefined) {
      setOtherWorldPresences([]);
      return;
    }
    const recompute = () => {
      const playerPosition = readPlayerPosition(engine);
      const seen = new Set<string>();
      const next = onlineWorldPresences
        .filter((p) => p.actorExternalId !== playerId)
        .filter((p) => {
          if (seen.has(p.actorExternalId)) return false;
          seen.add(p.actorExternalId);
          return true;
        })
        .map((presence) => ({
          presence,
          distanceSq:
            (presence.position.x - playerPosition.x) ** 2
            + (presence.position.z - playerPosition.z) ** 2,
        }))
        .sort((a, b) => a.distanceSq - b.distanceSq)
        .slice(0, REMOTE_AVATAR_RENDER_CAP)
        .map(({ presence }) => presence);
      setOtherWorldPresences((current) =>
        current.length === next.length && current.every((row, index) => row.presenceId === next[index]?.presenceId && row.online === next[index]?.online && row.label === next[index]?.label)
          ? current
          : next,
      );
    };
    recompute();
    const unsubscribe = engine.subscribe(recompute);
    return () => {
      unsubscribe();
    };
  }, [engine, onlineWorldPresences, playerId]);

  // Poses republish on EVERY feed delivery — keying this on the identity-stable
  // rendered list froze remote avatars at their first synced position.
  useLayoutEffect(() => {
    if (onlineWorldPresences === undefined) {
      publishLiveRemotePoses([]);
      return;
    }
    const receivedAt = performance.now();
    const seen = new Set<string>();
    const livePoses: LiveRemotePose[] = [];
    for (const presence of onlineWorldPresences) {
      if (presence.actorExternalId === playerId) continue;
      if (seen.has(presence.actorExternalId)) continue;
      seen.add(presence.actorExternalId);
      livePoses.push({
        presenceId: presence.presenceId,
        actorExternalId: presence.actorExternalId,
        label: presence.label,
        kind: presence.kind,
        online: presence.online !== false,
        position: presence.position,
        rotationY: presence.rotationY,
        rotationPitch: presence.rotationPitch ?? 0,
        receivedAt,
      });
    }
    publishLiveRemotePoses(livePoses);
  }, [onlineWorldPresences, playerId]);

  const myPresenceLocation = presenceFeeds.myPresenceLocation;
  const myPresenceLocationRef = useRef(myPresenceLocation);
  useEffect(() => {
    myPresenceLocationRef.current = myPresenceLocation;
  }, [myPresenceLocation]);
  const presenceExistence =
    myPresenceLocation === undefined ? "loading" : myPresenceLocation === null ? "absent" : "present";

  const gameId = game?._id ?? null;

  useEffect(() => {
    if (!canViewGame || gameId === null) return;
    if (presenceExistence === "loading") return;
    if (presenceInitializedRef.current) return;

    let cancelled = false;
    const seedPresence = async () => {
      if (myPresenceLocationRef.current != null) {
        const clientPos = { x: myPresenceLocationRef.current.position.x, z: myPresenceLocationRef.current.position.z };
        engine.dispatch(engineActions.setPlayerPosition(clientPos));
        presenceInitializedRef.current = true;
        return;
      }
      const result = await presenceActions.ensurePresence({ gameId, externalId: playerId });
      if (cancelled || result == null) return;
      engine.dispatch(engineActions.setPlayerPosition({ x: result.position.x, z: result.position.z }));
      presenceInitializedRef.current = true;
    };
    void seedPresence();

    return () => {
      cancelled = true;
    };
  }, [canViewGame, engine, presenceActions, gameId, playerId, presenceExistence]);

  useEffect(() => {
    if (gameId === null) return;

    const doLeave = () => {
      void presenceActions.leavePresence({ gameId, externalId: playerId });
    };

    const onBeforeUnload = () => {
      doLeave();
    };
    window.addEventListener(DOM_EVENT.beforeUnload, onBeforeUnload);

    return () => {
      window.removeEventListener(DOM_EVENT.beforeUnload, onBeforeUnload);
      doLeave();
      presenceInitializedRef.current = false;
    };
  }, [gameId, presenceActions, playerId]);

  const [hasBeenDisplaced, setHasBeenDisplaced] = useState(false);
  useEffect(() => {
    if (!presenceInitializedRef.current) return;
    if (myPresenceLocation === null) {
      setHasBeenDisplaced(true);
    }
  }, [myPresenceLocation]);

  return { otherWorldPresences, hasBeenDisplaced };
}
