import { useEffect } from "react";

import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { LOCAL_PLAYER_CATALOG_ID, LOCAL_PLAYER_WALK_SPEED } from "@llmville/game/game/content";
import type { GameEngine } from "@/runtime/gameEngine";
import { subscribePlayerPosition } from "@/runtime/playerPosition";

export function useLocalPlayerSpawn() {
  const ctx = useGameContext();
  useEffect(() => {
    ctx.scene.entity.spawn(LOCAL_PLAYER_CATALOG_ID, { id: ctx.player.userId });
    return () => {
      ctx.scene.entity.despawn(ctx.player.userId);
    };
  }, [ctx]);
}

export function useLocalPlayerPositionSync(engine: GameEngine): void {
  const ctx = useGameContext();
  useEffect(
    () =>
      subscribePlayerPosition(engine, ({ x, z }) => {
        ctx.scene.entity.setPose(ctx.player.userId, { position: [x, 0, z] });
      }),
    [ctx, engine],
  );
}

export function useLocalPlayerWalkSpeed(): number {
  const ctx = useGameContext();
  return useGameStore(
    (context) => context.scene.entity.get(ctx.player.userId)?.movement.walkSpeed ?? LOCAL_PLAYER_WALK_SPEED,
  );
}
