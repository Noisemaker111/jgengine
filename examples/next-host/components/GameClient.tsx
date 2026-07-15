"use client";

import { GamePlayer } from "@jgengine/shell/GamePlayer";
import type { GameRegistry } from "@jgengine/shell/registry";

const gameRegistry: GameRegistry = {
  "spire-cards": () => import("@games/spire-cards").then((module) => module.game),
};

export default function GameClient() {
  return (
    <GamePlayer
      gameId={process.env.NEXT_PUBLIC_GAME_ID ?? "spire-cards"}
      registry={gameRegistry}
      fallbackGameId="spire-cards"
      loading={
        <div className="flex h-full items-center justify-center bg-neutral-950 text-sm text-neutral-400">
          Loading game…
        </div>
      }
    />
  );
}
