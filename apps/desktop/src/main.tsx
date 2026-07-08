import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { GamePlayerShell } from "@jgengine/shell/GamePlayerShell";
import { GameUiPreview } from "@jgengine/shell/GameUiPreview";
import { resolveShellMultiplayer, type ShellMultiplayer } from "@jgengine/shell/multiplayer";
import type { GameRegistry, PlayableGame } from "@jgengine/shell/registry";

import "./index.css";

const gameModules = import.meta.glob<{ game: PlayableGame }>("../../../Games/*/src/index.tsx");

const gameEntries = Object.fromEntries(
  Object.entries(gameModules).map(([path, loader]) => [
    path.split("/").at(-3)!,
    () => loader().then((module) => module.game),
  ]),
);

const gameRegistry: GameRegistry = {
  ...gameEntries,
};

const urlParams = new URLSearchParams(window.location.search);
const GAME_ID =
  urlParams.get("game") ??
  (import.meta.env.VITE_GAME_ID as string | undefined) ??
  "voxel-mine";
const MODE = urlParams.get("mode") ?? "play";
const WS_URL = import.meta.env.VITE_JG_WS_URL as string | undefined;

function DesktopApp() {
  const [playable, setPlayable] = useState<PlayableGame | null>(null);
  const [multiplayer, setMultiplayer] = useState<ShellMultiplayer | null>(null);
  useEffect(() => {
    const load = gameRegistry[GAME_ID] ?? gameRegistry["voxel-mine"];
    if (load === undefined) return;
    void load().then((loaded) => {
      setMultiplayer(
        resolveShellMultiplayer({
          game: loaded.game,
          gameId: GAME_ID,
          url: WS_URL,
          force: WS_URL !== undefined,
        }),
      );
      setPlayable(loaded);
    });
  }, []);
  if (playable === null) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-950 text-sm text-neutral-400">
        Loading game…
      </div>
    );
  }
  if (MODE === "ui") return <GameUiPreview playable={playable} />;
  return <GamePlayerShell playable={playable} multiplayer={multiplayer} />;
}

createRoot(document.getElementById("root")!).render(<DesktopApp />);
