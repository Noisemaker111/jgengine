import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";

import type {
  EnsurePresenceResult,
  PresenceActions,
  PresenceFeeds,
  PresenceSession,
  PresenceResidentRow,
  PresenceTransport,
} from "@jgengine/core/multiplayer/presenceContract";

/**
 * The Convex functions a **game** supplies for a world it owns: presence keyed by the game's own ids,
 * including which residents exist while offline, which is game content and has no engine analogue.
 * Not satisfied by `createPresenceFunctions` (`@jgengine/convex/server`) — that is the pose lane of a
 * hosted `jgGameServers` server, backing `PresenceSync` rather than `PresenceTransport`.
 */
export interface ConvexPresenceFunctions {
  snapshot: FunctionReference<"query">;
  cityResidents: FunctionReference<"query">;
  ensurePresence: FunctionReference<"mutation">;
  leavePresence: FunctionReference<"mutation">;
  tick: FunctionReference<"mutation">;
}


/**
 * Wires a game's Convex presence functions into the engine's PresenceTransport
 * contract: one snapshot subscription (my location + online players), one
 * residents subscription (dormant candidates, decoupled from pose writes), and
 * one tick mutation for pose upload + keep-alive. Dormant rows are derived
 * client-side by subtracting the snapshot's online actors, so pose ticks never
 * re-execute the residents query. mapRow converts backend rows into the game's
 * row type (e.g. branding positions into its coordinate space).
 */
export function createConvexPresenceTransport<
  TRawRow extends PresenceResidentRow,
  TRow,
  TLocation,
  TGameId extends string = string,
>(
  functions: ConvexPresenceFunctions,
  mapRow: (row: TRawRow) => TRow,
): PresenceTransport<TRow, TLocation, TGameId> {
  function useFeeds(session: PresenceSession<TGameId> | "skip"): PresenceFeeds<TRow, TLocation> {
    const snapshotRaw = useQuery(
      functions.snapshot,
      session === "skip" ? "skip" : { ...session },
    ) as { myLocation: TLocation | null; online: TRawRow[] } | undefined;
    const residentsRaw = useQuery(functions.cityResidents, session === "skip" ? "skip" : { ...(session.viewerChunkKey === undefined ? {} : { viewerChunkKey: session.viewerChunkKey }) }) as
      | TRawRow[]
      | undefined;

    const onlineRaw = snapshotRaw?.online;
    const onlinePresences = useMemo(() => onlineRaw?.map(mapRow), [onlineRaw]);
    const dormantPresences = useMemo(() => {
      if (residentsRaw === undefined || onlineRaw === undefined) return undefined;
      const onlineActorIds = new Set(onlineRaw.map((row) => row.actorExternalId));
      return residentsRaw
        .filter(
          (resident) =>
            !onlineActorIds.has(resident.actorExternalId)
            && (resident.ownerActorId === undefined || !onlineActorIds.has(resident.ownerActorId)),
        )
        .map(mapRow);
    }, [residentsRaw, onlineRaw]);

    return useMemo(
      () => ({
        myPresenceLocation: snapshotRaw === undefined ? undefined : snapshotRaw.myLocation,
        onlinePresences,
        dormantPresences,
      }),
      [snapshotRaw, onlinePresences, dormantPresences],
    );
  }

  function useActions(): PresenceActions<TGameId> {
    const ensurePresence = useMutation(functions.ensurePresence);
    const leavePresence = useMutation(functions.leavePresence);
    const tick = useMutation(functions.tick);

    return useMemo<PresenceActions<TGameId>>(
      () => ({
        ensurePresence: (args) => ensurePresence(args) as Promise<EnsurePresenceResult | null>,
        leavePresence: (args) => leavePresence(args) as Promise<{ left: boolean }>,
        syncPose: (pose) => {
          void tick({
            position: pose.position,
            rotationY: pose.rotationY,
            rotationPitch: pose.rotationPitch,
            externalId: pose.externalId,
          });
        },
      }),
      [ensurePresence, leavePresence, tick],
    );
  }

  return { useFeeds, useActions };
}
