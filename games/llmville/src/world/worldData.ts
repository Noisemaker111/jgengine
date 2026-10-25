import { api } from "@llmville/backend/convex/_generated/api";
import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { MAX_WORLD_CHUNK_QUERY_RADIUS } from "@llmville/game/datacenter/worldChunks";
import type { WorldPresenceRow } from "@/multiplayer/presenceTransport";

export interface UseWorldDataQueriesOptions {
  gameId: Id<"games">;
  viewerChunkCenter: { x: number; z: number };
  onlinePresences: readonly WorldPresenceRow[] | undefined;
}

type PersonalUpgradeList = NonNullable<ReturnType<typeof useQuery<typeof api.upgrades.listPersonalUpgrades>>>;

export interface WorldDataQueriesResult {
  gameState: ReturnType<typeof useQuery<typeof api.world.state>>;
  gameWorldState: ReturnType<typeof useQuery<typeof api.world.scene>>;
  worldScene: ReturnType<typeof useQuery<typeof api.world.worldScene>>;
  claims: ReturnType<typeof useQuery<typeof api.datacenter.listClaims>>;
  myClaims: ReturnType<typeof useQuery<typeof api.datacenter.myClaims>>;
  playerProfile: ReturnType<typeof useQuery<typeof api.user.getPlayerProfile>>;
  personalUpgrades: PersonalUpgradeList | undefined;
  isWorldQueryBundleReady: boolean;
}

/**
 * Crossing a chunk boundary changes the query args, so Convex hands back `undefined` until the new
 * chunk set lands. Keeping the last loaded value means walking re-renders the world one step stale
 * instead of collapsing it back to the boot screen.
 */
function useLastLoaded<T>(value: T | undefined): T | undefined {
  const [lastLoaded, setLastLoaded] = useState(value);
  if (value !== undefined && value !== lastLoaded) setLastLoaded(value);
  return value ?? lastLoaded;
}

export function useWorldDataQueries({
  gameId,
  viewerChunkCenter,
  onlinePresences,
}: UseWorldDataQueriesOptions): WorldDataQueriesResult {
  // These queries depend only on the route's gameId / playerId, never on each
  // other, so they all subscribe at once. The game route only mounts this hook
  // after it has confirmed the Convex identity and view access, so there is no
  // need to chain them behind one another — chaining just stacks round-trips and
  // makes "Loading world…" drag.
  const gameState = useQuery(api.world.state, { gameId });
  const playerProfile = useQuery(api.user.getPlayerProfile, {});
  const personalUpgrades = useQuery(
    api.upgrades.listPersonalUpgrades,
    { gameId },
  );
  const gameWorldState = useQuery(api.world.scene, { gameId });
  const worldScene = useLastLoaded(
    useQuery(api.world.worldScene, {
      x: viewerChunkCenter.x,
      z: viewerChunkCenter.z,
      radius: MAX_WORLD_CHUNK_QUERY_RADIUS,
    }),
  );
  const claims = useLastLoaded(
    useQuery(api.datacenter.listClaims, {
      x: viewerChunkCenter.x,
      z: viewerChunkCenter.z,
      radius: MAX_WORLD_CHUNK_QUERY_RADIUS,
    }),
  );
  const myClaims = useQuery(api.datacenter.myClaims, { gameId });
  const isWorldQueryBundleReady =
    playerProfile !== undefined &&
    personalUpgrades !== undefined &&
    claims !== undefined &&
    worldScene !== undefined &&
    onlinePresences !== undefined;

  return {
    gameState,
    gameWorldState,
    worldScene,
    claims,
    myClaims,
    playerProfile,
    personalUpgrades: isWorldQueryBundleReady ? personalUpgrades : undefined,
    isWorldQueryBundleReady,
  };
}

export function useWorldDataMutations() {
  return {
    serveModelMutation: useMutation(api.serving.serve),
    buyMutation: useMutation(api.store.buy),
    buyPersonalUpgradeMutation: useMutation(api.upgrades.buyPersonalUpgrade),
    resolveEventMutation: useMutation(api.world.resolveEvent),
    startPostTrainingMutation: useMutation(api.models.train),
    unlockBaseModelMutation: useMutation(api.store.unlock),
    launchLicensedBaseServeMutation: useMutation(api.models.launch),
    renameModelMutation: useMutation(api.models.rename),
    revealModelMutation: useMutation(api.models.reveal),
    quantizeModelMutation: useMutation(api.models.quantize),
    moveRackHardwareMutation: useMutation(api.rack.moveHardware),
    installCoolerIntoRackMutation: useMutation(api.rack.cool),
    uninstallCoolerFromRackMutation: useMutation(api.rack.uncool),
    unlockResearchItemMutation: useMutation(api.store.unlock),
    assignCardMutation: useMutation(api.inference.assignCard),
    unassignCardMutation: useMutation(api.inference.unassignCard),
    setScrapeTierMutation: useMutation(api.inference.setScrapeTier),
    setServingModeMutation: useMutation(api.serving.mode),
    claimCellMutation: useMutation(api.datacenter.claimCell),
  };
}

export type WorldDataMutations = ReturnType<typeof useWorldDataMutations>;
