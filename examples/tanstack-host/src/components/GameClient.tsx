import { GamePlayer } from "@jgengine/shell/GamePlayer";
import type { GameRegistry } from "@jgengine/shell/registry";

const gameRegistry: GameRegistry = {
  demo: () => import("@jgengine/shell/demo/demoGame").then((module) => module.demoGame),
  "block-stacker": () => import("@games/block-stacker").then((module) => module.game),
};

const GAME_ID = import.meta.env.VITE_GAME_ID ?? "block-stacker";

export default function GameClient() {
  return (
    <GamePlayer
      gameId={GAME_ID}
      registry={gameRegistry}
      fallbackGameId="demo"
      loading={
        <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", background: "#0a0a0a", color: "#999", fontSize: "0.875rem" }}>
          Loading game…
        </div>
      }
    />
  );
}
