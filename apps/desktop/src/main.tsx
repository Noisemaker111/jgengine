import { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { GamePlayerShell } from "@jgengine/shell/GamePlayerShell";
import { GameUiPreview } from "@jgengine/shell/GameUiPreview";
import { resolveShellMultiplayer, type ShellMultiplayer } from "@jgengine/shell/multiplayer";
import type { GameRegistry, PlayableGame } from "@jgengine/shell/registry";

import "./index.css";

// Standalone scene editor — the same @jgengine/editor games ship, mounted over a blank world.
const StandaloneEditor = lazy(async () => ({
  default: (await import("@jgengine/editor")).StandaloneEditor,
}));

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
const DEFAULT_GAME_ID = "studio-showcase";
const GAME_ID =
  urlParams.get("game") ??
  (import.meta.env.VITE_GAME_ID as string | undefined) ??
  DEFAULT_GAME_ID;
const MODE = urlParams.get("mode") ?? "play";
const WS_URL = import.meta.env.VITE_JG_WS_URL as string | undefined;

function DesktopApp() {
  const [playable, setPlayable] = useState<PlayableGame | null>(null);
  const [multiplayer, setMultiplayer] = useState<ShellMultiplayer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    const load = gameRegistry[GAME_ID] ?? gameRegistry[DEFAULT_GAME_ID];
    if (load === undefined) {
      setLoadError(`Unknown game "${GAME_ID}"`);
      return;
    }
    void load()
      .then((loaded) => {
        setMultiplayer(
          resolveShellMultiplayer({
            game: loaded.game,
            gameId: GAME_ID,
            url: WS_URL,
            force: WS_URL !== undefined,
          }),
        );
        setPlayable(loaded);
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : String(error));
      });
  }, []);
  if (loadError !== null) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-950 px-6 text-center text-sm text-red-400">
        Failed to load {GAME_ID}: {loadError}
      </div>
    );
  }
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

function Root() {
  if (MODE === "editor") {
    return (
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center bg-neutral-950 text-sm text-neutral-400">
            Loading editor…
          </div>
        }
      >
        <StandaloneEditor sceneId={GAME_ID} />
      </Suspense>
    );
  }
  return <DesktopApp />;
}

createRoot(document.getElementById("root")!).render(<Root />);
