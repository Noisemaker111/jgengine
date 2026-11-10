import { useEffect, useRef } from "react";

import { mountGamePlayer } from "@jgengine/shell/mountGamePlayer";
import type { GameRegistry } from "@jgengine/shell/registry";

// The probe games live in this repo's games/. To host a real game here, copy one
// into this project and point the registry at it:
const gameRegistry: GameRegistry = {};

const GAME_ID = import.meta.env["VITE_GAME_ID"] ?? "deepward";

// The engine draws its own UI; a React page gives it an element and mounts the player into it.
export default function GameClient() {
  const stage = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (stage.current === null) return;
    return mountGamePlayer(stage.current, { gameId: GAME_ID, registry: gameRegistry, fallbackGameId: "deepward", loadingText: "Loading game…" });
  }, []);
  return <div ref={stage} style={{ width: "100%", height: "100%", background: "#0a0a0a" }} />;
}
