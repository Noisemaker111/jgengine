import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import type { GameCameraConfig } from "@jgengine/core/game/playableGame";
import { GamePlayerShell } from "@jgengine/shell/GamePlayerShell";
import { GameUiPreview } from "@jgengine/shell/GameUiPreview";
import { resolveShellMultiplayer, type ShellMultiplayer } from "@jgengine/shell/multiplayer";
import type { GameRegistry, PlayableGame } from "@jgengine/shell/registry";

import "./index.css";

const CAMERA_PRESETS: Record<string, GameCameraConfig> = {
  orbit: { rig: "orbit" },
  first: { rig: "first" },
  topdown: { rig: "topDown", topDown: { yaw: 0, pitch: 1.35, height: 20 } },
  iso: { rig: "topDown", topDown: { yaw: Math.PI / 4, pitch: 0.95, height: 18 } },
  rts: { rig: "rts", rts: { yaw: Math.PI / 5, pitch: 1.0, height: 22, panSpeed: 26 } },
  shoulder: { rig: "shoulder", shoulder: { shoulderOffset: 0.7, distance: 3.4, heightOffset: 1.6 } },
  lockon: { rig: "lockOn", lockOn: { distance: 5.5, height: 2.6, framingBias: 0.55 } },
  chase: { rig: "chase", chase: { distance: 6.5, height: 2.8, fov: { base: 55, max: 82, speedForMax: 12 } } },
  cockpit: { rig: "chase", chase: { view: "cockpit" } },
  rear: { rig: "chase", chase: { view: "rear" } },
};

const gameRegistry: GameRegistry = {
  demo: () => import("@jgengine/shell/demo/demoGame").then((module) => module.demoGame),
  "environment-showcase": () =>
    import("@jgengine/shell/demo/environmentShowcase").then((module) => module.environmentShowcaseGame),
  "world-of-warcraft": () => import("@dogfood/world-of-warcraft").then((module) => module.wowGame),
  "asset-showcase": () =>
    import("@dogfood/asset-showcase").then((module) => module.assetShowcaseGame),
  "loot-shooter": () => import("@dogfood/loot-shooter").then((module) => module.lootShooterGame),
  "stress-bench": () => import("@dogfood/stress-bench").then((module) => module.stressBenchGame),
};

const urlParams = new URLSearchParams(window.location.search);
const GAME_ID =
  urlParams.get("game") ??
  (import.meta.env.VITE_GAME_ID as string | undefined) ??
  "world-of-warcraft";
const MODE = urlParams.get("mode") ?? "play";
const CAM = urlParams.get("cam");
const WS_URL = import.meta.env.VITE_JG_WS_URL as string | undefined;

function withCameraPreset(game: PlayableGame): PlayableGame {
  if (CAM === null) return game;
  const preset = CAMERA_PRESETS[CAM];
  if (preset === undefined) return game;
  return { ...game, camera: { ...game.camera, ...preset } };
}

function DevApp() {
  const [playable, setPlayable] = useState<PlayableGame | null>(null);
  const [multiplayer, setMultiplayer] = useState<ShellMultiplayer | null>(null);
  useEffect(() => {
    const load = gameRegistry[GAME_ID] ?? gameRegistry.demo;
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
      setPlayable(withCameraPreset(loaded));
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

createRoot(document.getElementById("root")!).render(<DevApp />);
