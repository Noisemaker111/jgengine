import { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { GamePlayerShell } from "@jgengine/shell/GamePlayerShell";
import { GameUiPreview } from "@jgengine/shell/GameUiPreview";
import { resolveShellMultiplayer, type ShellMultiplayer } from "@jgengine/shell/multiplayer";
import type { GameRegistry, PlayableGame } from "@jgengine/shell/registry";

import { Launcher } from "./launcher/Launcher";
import "./index.css";

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
  null;
const MODE = urlParams.get("mode") ?? "play";
const VIEW = urlParams.get("view");
const WS_URL = import.meta.env.VITE_JG_WS_URL as string | undefined;
const SHOW_LAUNCHER = VIEW === "launcher" || GAME_ID === null;

function LauncherChrome() {
  return <Launcher />;
}

function BackToLauncher() {
  return (
    <a
      href="?view=launcher"
      className="fixed bottom-3 left-3 z-[100] rounded-md border border-neutral-700 bg-neutral-950/90 px-2.5 py-1 text-[11px] text-neutral-200 shadow-lg backdrop-blur hover:bg-neutral-900"
    >
      ← Launcher
    </a>
  );
}

function DesktopApp({ gameId }: { gameId: string }) {
  const [playable, setPlayable] = useState<PlayableGame | null>(null);
  const [multiplayer, setMultiplayer] = useState<ShellMultiplayer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    const load = gameRegistry[gameId] ?? gameRegistry[DEFAULT_GAME_ID];
    if (load === undefined) {
      setLoadError(`Unknown game "${gameId}"`);
      return;
    }
    void load()
      .then((loaded) => {
        setMultiplayer(
          resolveShellMultiplayer({
            game: loaded.game,
            gameId,
            url: WS_URL,
            force: WS_URL !== undefined,
          }),
        );
        setPlayable(loaded);
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : String(error));
      });
  }, [gameId]);
  if (loadError !== null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-neutral-950 px-6 text-center text-sm text-red-400">
        <div>
          Failed to load {gameId}: {loadError}
        </div>
        <a href="?view=launcher" className="text-sky-400 hover:underline">
          Back to launcher
        </a>
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
  if (MODE === "ui") {
    return (
      <>
        <BackToLauncher />
        <GameUiPreview playable={playable} />
      </>
    );
  }
  return (
    <>
      <BackToLauncher />
      <GamePlayerShell playable={playable} multiplayer={multiplayer} />
    </>
  );
}

function Root() {
  if (SHOW_LAUNCHER) {
    return <LauncherChrome />;
  }
  const gameId = GAME_ID ?? DEFAULT_GAME_ID;
  if (MODE === "editor") {
    return (
      <>
        <BackToLauncher />
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center bg-neutral-950 text-sm text-neutral-400">
              Loading editor…
            </div>
          }
        >
          <StandaloneEditor sceneId={gameId} />
        </Suspense>
      </>
    );
  }
  return <DesktopApp gameId={gameId} />;
}

createRoot(document.getElementById("root")!).render(<Root />);
