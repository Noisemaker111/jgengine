import { useCallback, type MouseEvent as ReactMouseEvent } from "react";

import type { MovementKeysState } from "@jgengine/core/movement/movementModel";
import { useGameContext } from "@jgengine/react/provider";
import {
  useMovementControls,
  type MovementControls,
} from "@/movement/movementInput";
import { useGameEngineState } from "@/runtime/gameEngine";
import { runPromptCommand } from "@/runtime/promptCommands";
import type { AppKeybinds } from "@/settings/settings";
import { resolvePlayerSpeed } from "@llmville/game/user/personalUpgrades";
import { useLocalPlayerWalkSpeed } from "@/runtime/localPlayerEntity";
import type { WorldViewModel } from "@/runtime/worldState";

/** Movement props GameScene needs — spread straight onto <GameScene />. */
export interface MovementSceneBindings {
  movementKeys: MovementKeysState;
  playerSpeed: number;
  canMove: boolean;
  playInputTouch: boolean;
  onStepPlayer: (deltaX: number, deltaZ: number) => void;
  onTouchInteract?: () => void;
}

/** Everything a screen needs to wire movement, from one call. */
export interface Movement {
  isTouch: boolean;
  controls: MovementControls;
  onSessionMouseDown: (event: ReactMouseEvent) => void;
  sceneBindings: MovementSceneBindings;
}

interface UseMovementParams {
  world: WorldViewModel;
  keybinds: AppKeybinds;
}

export function useMovement({ world, keybinds }: UseMovementParams): Movement {
  const ctx = useGameContext();
  const controls = useMovementControls({ engine: world.engine, keybinds });
  const movementKeys = useGameEngineState(world.engine, (state) => state.player.keysDown);
  const walkSpeed = useLocalPlayerWalkSpeed();
  const { interactionPrompt } = world;

  const onTouchInteract = useCallback(() => {
    const invoke = interactionPrompt?.prompt.invoke;
    if (invoke) {
      runPromptCommand(ctx, invoke);
    }
  }, [ctx, interactionPrompt]);

  const playerSpeed = resolvePlayerSpeed(walkSpeed, world.playerProfile?.walkSpeedLevel ?? 1);

  return {
    isTouch: controls.isTouch,
    controls,
    onSessionMouseDown: controls.onSessionMouseDown,
    sceneBindings: {
      movementKeys,
      playerSpeed,
      canMove: world.canMove,
      playInputTouch: controls.isTouch,
      onStepPlayer: world.onStepPlayer,
      onTouchInteract: controls.isTouch ? onTouchInteract : undefined,
    },
  };
}
