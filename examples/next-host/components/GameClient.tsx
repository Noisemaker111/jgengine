"use client";

import { GamePlayer } from "@jgengine/shell/GamePlayer";
import type { GameRegistry } from "@jgengine/shell/registry";

// Probe games now live in Noisemaker111/JGengine-games (ephemeral ./Games clone).
// This example previously imported "@games/spire-cards" as a workspace game.
// To host a real game here, add that games repo as a dependency or copy a game
// into this project and point the registry at it:
const gameRegistry: GameRegistry = {};

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
