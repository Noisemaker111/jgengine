import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

import type { GameContext } from "@jgengine/core/runtime/gameContextTypes";
import { characterMotionFromKey, characterMotionKey, resolveCharacterMotion, type CharacterMotionParts, type CharacterMotionConfig } from "./characterMotion";

/** The game's own character-motion layer (`scene.characterMotion`); the shell provides it. */
export const CharacterMotionContext = createContext<CharacterMotionConfig | false | undefined>(undefined);

/**
 * The parts of the default character motion this entity runs: the game's layer, then its model's,
 * then the entity's own `characterMotion`, which re-renders the model when it changes.
 */
export function useCharacterMotion(model: CharacterMotionConfig | false | undefined, ctx: GameContext | null, instanceId: string | undefined): CharacterMotionParts {
  const game = useContext(CharacterMotionContext);
  const subscribe = useCallback(
    (listener: () => void) => (ctx === null || instanceId === undefined ? () => {} : ctx.subscribe(listener)),
    [ctx, instanceId],
  );
  const entityKey = useSyncExternalStore(subscribe, () =>
    ctx === null || instanceId === undefined ? "" : characterMotionKey(ctx.scene.entity.get(instanceId)?.characterMotion),
  );
  return resolveCharacterMotion(game, model, characterMotionFromKey(entityKey));
}
