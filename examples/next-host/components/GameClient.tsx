"use client";

import { GamePlayer } from "@jgengine/shell/GamePlayer";
import type { GameRegistry } from "@jgengine/shell/registry";

// The probe games live in this repo's games/. To host a real game here, copy one
// into this project and point the registry at it:
const gameRegistry: GameRegistry = {};

export default function GameClient() {
  return (
    <GamePlayer
      gameId={process.env["NEXT_PUBLIC_GAME_ID"] ?? "deepward"}
      registry={gameRegistry}
      fallbackGameId="deepward"
      loading={
        <div className="flex h-full items-center justify-center bg-neutral-950 text-sm text-neutral-400">
          Loading game…
        </div>
      }
    />
  );
}
