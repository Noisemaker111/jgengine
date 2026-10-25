import { useEffect, useMemo, useSyncExternalStore } from "react";

import { useActivePrompt } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { buildSceneObjectPrompts } from "@llmville/game/simulation/interaction";
import { engineActions, type GameEngine } from "@/runtime/gameEngine";

export function useInteractionPromptSync(engine: GameEngine): void {
  const ctx = useGameContext();
  const objects = useSyncExternalStore(
    ctx.scene.object.subscribe,
    ctx.scene.object.list,
    ctx.scene.object.list,
  );
  const prompts = useMemo(
    () =>
      buildSceneObjectPrompts(
        objects,
        (instanceId) => ctx.scene.object.catalog(instanceId)?.proximityPrompt ?? null,
      ),
    [ctx, objects],
  );
  const activePrompt = useActivePrompt(prompts);

  useEffect(() => {
    engine.dispatch(engineActions.setActivePrompt(activePrompt));
  }, [activePrompt, engine]);
}
