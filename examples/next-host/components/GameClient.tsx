"use client";

import { useEffect, useState } from "react";

import { GamePlayerShell } from "@jgengine/shell/GamePlayerShell";
import type { GameRegistry, PlayableGame } from "@jgengine/shell/registry";

const gameRegistry: GameRegistry = {
  "block-stacker": () => import("@games/block-stacker").then((module) => module.game),
};

const GAME_ID = process.env.NEXT_PUBLIC_GAME_ID ?? "block-stacker";

export default function GameClient() {
  const [playable, setPlayable] = useState<PlayableGame | null>(null);
  useEffect(() => {
    const load = gameRegistry[GAME_ID] ?? gameRegistry["block-stacker"];
    if (load !== undefined) void load().then(setPlayable);
  }, []);
  if (playable === null) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-950 text-sm text-neutral-400">
        Loading game…
      </div>
    );
  }
  return <GamePlayerShell playable={playable} />;
}
