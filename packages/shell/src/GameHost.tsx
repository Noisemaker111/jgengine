import { useMemo } from "react";

import { GamePlayerShell } from "./GamePlayerShell";
import { resolveShellMultiplayer } from "./multiplayer";
import type { PlayableGame } from "./registry";

export interface GameHostProps {
  playable: PlayableGame;
  gameId?: string;
  wsUrl?: string;
}

export function GameHost({ playable, gameId, wsUrl }: GameHostProps) {
  const multiplayer = useMemo(
    () =>
      resolveShellMultiplayer({
        game: playable.game,
        gameId: gameId ?? playable.game.name,
        url: wsUrl,
        force: wsUrl !== undefined,
      }),
    [playable, gameId, wsUrl],
  );
  return <GamePlayerShell playable={playable} multiplayer={multiplayer} />;
}
