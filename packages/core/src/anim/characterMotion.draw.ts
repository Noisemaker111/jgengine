import { createContext, useCallback, useContext, useSyncExternalStore } from "@jgengine/core/ui/jsx";

import type { GameContext } from "@jgengine/core/runtime/gameContextTypes";
import { characterMotionFromKey, characterMotionKey, resolveCharacterMotion, type CharacterMotionParts, type CharacterMotionConfig } from "./characterMotion";

export const CharacterMotionContext = createContext<CharacterMotionConfig | false | undefined>(undefined);

let drawGameMotion: CharacterMotionConfig | false | undefined;

export function noteGameCharacterMotion(layer: CharacterMotionConfig | false | undefined): void {
  drawGameMotion = layer;
}

export function drawCharacterMotion(
  model: CharacterMotionConfig | false | undefined,
  ctx: GameContext | null,
  instanceId: string | undefined,
): CharacterMotionParts {
  const entityKey = ctx === null || instanceId === undefined ? "" : characterMotionKey(ctx.scene.entity.get(instanceId)?.characterMotion);
  return resolveCharacterMotion(drawGameMotion, model, characterMotionFromKey(entityKey));
}

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
