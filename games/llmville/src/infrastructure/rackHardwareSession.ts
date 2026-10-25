/**
 * Rack hardware session — one warehouse↔rack move mutation plus cooler mutations for one play session.
 */

import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import { api } from "@llmville/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { useCallback } from "react";

import type { PlacedRack } from "@/infrastructure/infrastructure";
import type { HardwareModelId, RackCoolingUnitId } from "@llmville/game/infrastructure/catalog";

export type RackHardwareMoveSource =
  | { kind: "stock"; hardwareId: HardwareModelId }
  | { kind: "slot"; slot: number };

export type RackHardwareMoveTarget = { kind: "stock" } | { kind: "slot"; slot?: number };
import { withEditAccess, wrapMutation } from "@/runtime/gameEngine";

export interface RackHardwareViewModel {
  moveHardware: (
    rackId: PlacedRack["id"],
    from: RackHardwareMoveSource,
    to: RackHardwareMoveTarget,
  ) => void | Promise<unknown> | undefined;
  onInstallCoolerToRack: (rackId: PlacedRack["id"], coolingUnitId: RackCoolingUnitId) => void | Promise<unknown> | undefined;
  onUninstallCoolerFromRack: (rackId: PlacedRack["id"]) => void | Promise<unknown> | undefined;
}

export function useRackHardwareSession({
  canEditGame,
  gameId,
}: {
  canEditGame: boolean;
  gameId: Id<"games"> | null;
}): RackHardwareViewModel {
  const moveHardwareMutation = useMutation(api.rack.moveHardware);
  const installCoolerMutation = useMutation(api.rack.cool);
  const uninstallCoolerMutation = useMutation(api.rack.uncool);

  const moveHardware = useCallback(
    (rackId: PlacedRack["id"], from: RackHardwareMoveSource, to: RackHardwareMoveTarget) => {
      return withEditAccess({ canEditGame, gameId }, (editableGameId) =>
        wrapMutation(
          "moveRackHardware",
          moveHardwareMutation({ gameId: editableGameId, rackId, from, to }),
        ),
      );
    },
    [canEditGame, gameId, moveHardwareMutation],
  );

  const onInstallCoolerToRack = useCallback((rackId: PlacedRack["id"], coolingUnitId: RackCoolingUnitId) => {
    return withEditAccess({ canEditGame, gameId }, (editableGameId) =>
      wrapMutation(
        "installCoolerIntoRack",
        installCoolerMutation({ gameId: editableGameId, rackId, coolingUnitId }),
      ),
    );
  }, [canEditGame, gameId, installCoolerMutation]);

  const onUninstallCoolerFromRack = useCallback((rackId: PlacedRack["id"]) => {
    return withEditAccess({ canEditGame, gameId }, (editableGameId) =>
      wrapMutation(
        "uninstallCoolerFromRack",
        uninstallCoolerMutation({ gameId: editableGameId, rackId }),
      ),
    );
  }, [canEditGame, gameId, uninstallCoolerMutation]);

  return {
    moveHardware,
    onInstallCoolerToRack,
    onUninstallCoolerFromRack,
  };
}
