import { GamePlayer } from "@jgengine/shell/GamePlayer";
import type { GameRegistry } from "@jgengine/shell/registry";

// Probe games now live in Noisemaker111/JGengine-games (ephemeral ./Games clone).
// This example previously imported "@games/wayfarer-deck" as a workspace game.
// To host a real game here, add that games repo as a dependency or copy a game
// into this project and point the registry at it:
const gameRegistry: GameRegistry = {};

const GAME_ID = import.meta.env.VITE_GAME_ID ?? "wayfarer-deck";

export default function GameClient() {
  return (
    <GamePlayer
      gameId={GAME_ID}
      registry={gameRegistry}
      fallbackGameId="wayfarer-deck"
      loading={
        <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", background: "#0a0a0a", color: "#999", fontSize: "0.875rem" }}>
          Loading game…
        </div>
      }
    />
  );
}
