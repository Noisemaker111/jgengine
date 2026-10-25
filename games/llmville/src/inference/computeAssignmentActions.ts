/**
 * Compute-assignment slice of the WorldViewModel — per-card lane assignment,
 * scrape tier, and serving mode, gated on edit access.
 */
import { useMemo } from "react";

import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import type { ComputeLane } from "@llmville/game/infrastructure/infrastructure";
import type { ScrapeTierId } from "@llmville/game/models/scrapingTiers";
import type { ServingModeId } from "@llmville/game/models/servingMode";
import { showActionErrorFromException } from "@/runtime/actionFeedback";
import { wrapMutation } from "@/runtime/gameEngine";
import type { WorldDataMutations } from "@/world/worldData";

interface UseComputeAssignmentActionsParams {
  canEditGame: boolean;
  gameId: Id<"games"> | null;
  playerId: string;
  mutations: Pick<
    WorldDataMutations,
    | "assignCardMutation"
    | "unassignCardMutation"
    | "setScrapeTierMutation"
    | "setServingModeMutation"
  >;
}

export function useComputeAssignmentActions({
  canEditGame,
  gameId,
  playerId,
  mutations,
}: UseComputeAssignmentActionsParams) {
  const { assignCardMutation, unassignCardMutation, setScrapeTierMutation, setServingModeMutation } = mutations;

  return useMemo(() => {
    const editableGameId = canEditGame ? gameId : null;

    return {
      onAssignCard: (
        rackId: string,
        slotIndex: number,
        lane: ComputeLane,
        targetModelId?: Id<"models">,
      ) => {
        if (editableGameId === null) return;
        void wrapMutation(
          "assignCard",
          assignCardMutation({
            gameId: editableGameId,
            rackId,
            slotIndex,
            lane,
            targetModelId,
            externalId: playerId,
          }),
          { onError: (error) => showActionErrorFromException(error) },
        );
      },
      onUnassignCard: (rackId: string, slotIndex: number) => {
        if (editableGameId === null) return;
        void wrapMutation(
          "unassignCard",
          unassignCardMutation({ gameId: editableGameId, rackId, slotIndex, externalId: playerId }),
          { onError: (error) => showActionErrorFromException(error) },
        );
      },
      onSetScrapeTier: (tier: ScrapeTierId) => {
        if (editableGameId === null) return;
        void wrapMutation(
          "setScrapeTier",
          setScrapeTierMutation({ gameId: editableGameId, tier, externalId: playerId }),
          { onError: (error) => showActionErrorFromException(error) },
        );
      },
      onSetServingMode: (mode: ServingModeId) => {
        if (editableGameId === null) return;
        void wrapMutation(
          "setServingMode",
          setServingModeMutation({ gameId: editableGameId, mode, externalId: playerId }),
          { onError: (error) => showActionErrorFromException(error) },
        );
      },
    };
  }, [
    assignCardMutation,
    canEditGame,
    gameId,
    playerId,
    setScrapeTierMutation,
    setServingModeMutation,
    unassignCardMutation,
  ]);
}
