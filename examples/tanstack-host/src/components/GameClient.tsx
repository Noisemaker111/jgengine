import { GamePlayer } from "@jgengine/shell/GamePlayer";
import type { GameRegistry } from "@jgengine/shell/registry";

// The probe games live in this repo's games/. To host a real game here, copy one
// into this project and point the registry at it:
const gameRegistry: GameRegistry = {};

const GAME_ID = import.meta.env["VITE_GAME_ID"] ?? "deepward";

export default function GameClient() {
  return (
    <GamePlayer
      gameId={GAME_ID}
      registry={gameRegistry}
      fallbackGameId="deepward"
      loading={
        <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", background: "#0a0a0a", color: "#999", fontSize: "0.875rem" }}>
          Loading game…
        </div>
      }
    />
  );
}
