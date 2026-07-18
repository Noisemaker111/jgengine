import { useEffect, useState, type ReactNode } from "react";

import { GamePlayerShell } from "./GamePlayerShell";
import type { ShellMultiplayer } from "./multiplayer";
import type { GameRegistry, PlayableGame } from "./registry";
import { resolveGameLoader } from "./registry";

export type GamePlayerProps = {
  gameId: string;
  registry: GameRegistry;
  fallbackGameId?: string;
  loading?: ReactNode;
  multiplayer?: ShellMultiplayer | null;
};

/**
 * Registry-driven lazy loader over {@link GamePlayerShell} for multi-game hosts.
 * Games mount through `GameHost` — the one documented mount.
 * @internal
 */
export function GamePlayer({ gameId, registry, fallbackGameId, loading = null, multiplayer = null }: GamePlayerProps) {
  const [playable, setPlayable] = useState<PlayableGame | null>(null);
  useEffect(() => {
    let cancelled = false;
    setPlayable(null);
    const load = resolveGameLoader(registry, gameId, fallbackGameId);
    if (load !== undefined) {
      void load().then((game) => {
        if (!cancelled) setPlayable(game);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [gameId, fallbackGameId]);
  if (playable === null) return <>{loading}</>;
  return <GamePlayerShell playable={playable} multiplayer={multiplayer} />;
}
