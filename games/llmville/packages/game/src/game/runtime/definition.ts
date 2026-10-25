import { createGameRuntime, type GameRuntime } from "@jgengine/core/runtime/gameRuntime";
import type { CommandDef } from "@jgengine/core/runtime/commandRunner";
import type { SaveConfig } from "@jgengine/core/runtime/save";
import {
  DEFAULT_STARTING_DATA_TOKENS,
  DEFAULT_STARTING_MONEY,
} from "@llmville/game/world/worldBootstrap";
import { SET_SESSION_POSE_COMMAND, setSessionPoseCommand } from "@llmville/game/game/runtime/session";
import {
  PICKUP_BUILD_ITEM_COMMAND,
  PLACE_BUILD_ITEM_COMMAND,
  pickupBuildItemCommand,
  placeBuildItemCommand,
} from "@llmville/game/game/runtime/buildCommands";
import {
  ASSIGN_RACK_CARD_COMMAND,
  INSTALL_RACK_COOLER_COMMAND,
  MOVE_RACK_HARDWARE_COMMAND,
  UNASSIGN_RACK_CARD_COMMAND,
  UNINSTALL_RACK_COOLER_COMMAND,
  assignRackCardCommand,
  installRackCoolerCommand,
  moveRackHardwareCommand,
  unassignRackCardCommand,
  uninstallRackCoolerCommand,
} from "@llmville/game/game/runtime/rackCommands";
import {
  START_TRAINING_COMMAND,
  startTrainingCommand,
} from "@llmville/game/game/runtime/trainingCommands";

export const LLMVILLE_GAME_ID = "llmville";

export const LLMVILLE_SAVE: SaveConfig = { auto: "30s", scope: "player+chunks" };

export const llmvilleCommands: Record<string, CommandDef> = {
  [SET_SESSION_POSE_COMMAND]: setSessionPoseCommand,
  [PLACE_BUILD_ITEM_COMMAND]: placeBuildItemCommand,
  [PICKUP_BUILD_ITEM_COMMAND]: pickupBuildItemCommand,
  [MOVE_RACK_HARDWARE_COMMAND]: moveRackHardwareCommand,
  [INSTALL_RACK_COOLER_COMMAND]: installRackCoolerCommand,
  [UNINSTALL_RACK_COOLER_COMMAND]: uninstallRackCoolerCommand,
  [ASSIGN_RACK_CARD_COMMAND]: assignRackCardCommand,
  [UNASSIGN_RACK_CARD_COMMAND]: unassignRackCardCommand,
  [START_TRAINING_COMMAND]: startTrainingCommand,
};

export function createLlmvilleRuntime(): GameRuntime {
  return createGameRuntime({
    gameId: LLMVILLE_GAME_ID,
    save: LLMVILLE_SAVE,
    commands: llmvilleCommands,
    loop: {
      joinScope: userId => ({ players: [userId], chunkKeys: [] }),
      onNewPlayer: ({ snapshot, setSnapshot, player }) => {
        if (!player.isNew) return;
        const row = snapshot.players[player.userId];
        if (row === undefined) return;
        setSnapshot({
          ...snapshot,
          players: {
            ...snapshot.players,
            [player.userId]: {
              ...row,
              economy: { money: DEFAULT_STARTING_MONEY, data: DEFAULT_STARTING_DATA_TOKENS, ...row.economy },
            },
          },
          dirty: {
            ...snapshot.dirty,
            players: snapshot.dirty.players.includes(player.userId)
              ? snapshot.dirty.players
              : [...snapshot.dirty.players, player.userId],
          },
        });
      },
    },
  });
}
