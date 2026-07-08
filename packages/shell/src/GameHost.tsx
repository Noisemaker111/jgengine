import { useMemo } from "react";

import { multiplayerAdapterKind } from "@jgengine/core/runtime/adapter";

import { GamePlayerShell } from "./GamePlayerShell";
import { resolveShellMultiplayer, type ResolveShellMultiplayerArgs, type ShellMultiplayer } from "./multiplayer";
import type { PlayableGame } from "./registry";

const warnedAdapterKinds = new Set<string>();

function warnUndrivenAdapter(kind: string): void {
  if (warnedAdapterKinds.has(kind)) return;
  warnedAdapterKinds.add(kind);
  console.warn(
    `GameHost: game declares multiplayer adapter "${kind}", which the built-in shell resolver cannot drive. ` +
      "Running offline. Pass a prebuilt session via the multiplayer prop, or a resolveMultiplayer prop, to GameHost.",
  );
}

export interface GameHostProps {
  playable: PlayableGame;
  gameId?: string;
  wsUrl?: string;
  /** Prebuilt multiplayer session. When present (including `null`), it is used as-is and no resolution is attempted. */
  multiplayer?: ShellMultiplayer | null;
  /** Tried before the built-in {@link resolveShellMultiplayer}; falls back to it when this returns `null`. */
  resolveMultiplayer?: (args: ResolveShellMultiplayerArgs) => ShellMultiplayer | null;
}

export function GameHost({ playable, gameId, wsUrl, multiplayer, resolveMultiplayer }: GameHostProps) {
  const resolved = useMemo(() => {
    if (multiplayer !== undefined) return multiplayer;

    const args: ResolveShellMultiplayerArgs = {
      game: playable.game,
      gameId: gameId ?? playable.game.name,
      url: wsUrl,
      force: wsUrl !== undefined,
    };
    const session = resolveMultiplayer?.(args) ?? resolveShellMultiplayer(args);
    if (session === null) {
      const kind = multiplayerAdapterKind(playable.game.multiplayer);
      if (kind !== null && kind !== "offline") warnUndrivenAdapter(kind);
    }
    return session;
  }, [playable, gameId, wsUrl, multiplayer, resolveMultiplayer]);

  return <GamePlayerShell playable={playable} multiplayer={resolved} />;
}
