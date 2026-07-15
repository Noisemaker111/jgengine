import { GamePlayer } from "@jgengine/shell/GamePlayer";
import type { GameRegistry } from "@jgengine/shell/registry";

const gameRegistry: GameRegistry = {
  "spire-cards": () => import("@games/spire-cards").then((module) => module.game),
};

const GAME_ID = import.meta.env.VITE_GAME_ID ?? "spire-cards";

export default function GameClient() {
  return (
    <GamePlayer
      gameId={GAME_ID}
      registry={gameRegistry}
      fallbackGameId="spire-cards"
      loading={
        <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", background: "#0a0a0a", color: "#999", fontSize: "0.875rem" }}>
          Loading game…
        </div>
      }
    />
  );
}
