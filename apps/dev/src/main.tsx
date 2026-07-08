import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import type { GameCameraConfig } from "@jgengine/core/game/playableGame";
import { GamePlayerShell } from "@jgengine/shell/GamePlayerShell";
import { GameUiPreview, type UiPreviewScenario } from "@jgengine/shell/GameUiPreview";
import { resolveConvexMultiplayer } from "@jgengine/convex/resolveConvexMultiplayer";
import {
  resolvePeerShellMultiplayer,
  resolveShellMultiplayer,
  type ShellMultiplayer,
} from "@jgengine/shell/multiplayer";
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
  observer: {
    rig: "observer",
    observer: { bind: { kind: "entity", entityId: "sensor-showcase-culprit" }, distance: 7, height: 3.5, orbitSpeed: 0.3 },
  },
};

const gameModules = import.meta.glob<{ game: PlayableGame; uiScenario?: UiPreviewScenario }>(
  "../../../Games/*/src/index.tsx",
);

const gameLoaders = Object.entries(gameModules).map(
  ([path, loader]) => [path.split("/").at(-3)!, loader] as const,
);

const gameEntries = Object.fromEntries(
  gameLoaders.map(([id, loader]) => [id, () => loader().then((module) => module.game)]),
);

const gameRegistry: GameRegistry = {
  demo: () => import("./demo/demoGame").then((module) => module.demoGame),
  "pointer-commander": () =>
    import("./demo/pointerDemo").then((module) => module.pointerDemoGame),
  "environment-showcase": () =>
    import("./demo/environmentShowcase").then((module) => module.environmentShowcaseGame),
  "survival-demo": () =>
    import("./demo/survivalDemo").then((module) => module.survivalDemoGame),
  "builder-sandbox": () =>
    import("./demo/builderDemo").then((module) => module.builderDemoGame),
  "extraction-map": () => import("./demo/mapDemo").then((module) => module.mapDemoGame),
  "sensor-showcase": () =>
    import("./demo/sensorShowcase").then((module) => module.sensorShowcaseGame),
  "social-hub": () =>
    import("./demo/socialHubDemo").then((module) => module.socialHubGame),
  ...gameEntries,
};

const uiScenarioRegistry: Partial<Record<string, () => Promise<UiPreviewScenario | undefined>>> =
  Object.fromEntries(
    gameLoaders.map(([id, loader]) => [id, () => loader().then((module) => module.uiScenario)]),
  );

const urlParams = new URLSearchParams(window.location.search);
const GAME_ID =
  urlParams.get("game") ??
  (import.meta.env.VITE_GAME_ID as string | undefined) ??
  "demo";
const MODE = urlParams.get("mode") ?? "play";
const CAM = urlParams.get("cam");
const WS_URL = import.meta.env.VITE_JG_WS_URL as string | undefined;
const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string | undefined;
const P2P_ROLE = urlParams.get("p2p");

function withCameraPreset(game: PlayableGame): PlayableGame {
  if (CAM === null) return game;
  const preset = CAMERA_PRESETS[CAM];
  if (preset === undefined) return game;
  return { ...game, camera: { ...game.camera, ...preset } };
}

function DevApp() {
  const [playable, setPlayable] = useState<PlayableGame | null>(null);
  const [multiplayer, setMultiplayer] = useState<ShellMultiplayer | null>(null);
  const [scenario, setScenario] = useState<UiPreviewScenario | undefined>(undefined);
  useEffect(() => {
    const load = gameRegistry[GAME_ID] ?? gameRegistry.demo;
    if (load === undefined) return;
    void load().then((loaded) => {
      if (P2P_ROLE === "host" || P2P_ROLE === "join") {
        void resolvePeerShellMultiplayer({ gameId: GAME_ID, role: P2P_ROLE }).then(setMultiplayer);
      } else {
        setMultiplayer(
          resolveConvexMultiplayer({
            game: loaded.game,
            gameId: GAME_ID,
            url: CONVEX_URL,
            force: CONVEX_URL !== undefined,
          }) ??
            resolveShellMultiplayer({
              game: loaded.game,
              gameId: GAME_ID,
              url: WS_URL,
              force: WS_URL !== undefined,
            }),
        );
      }
      setPlayable(withCameraPreset(loaded));
    });
    const loadScenario = uiScenarioRegistry[GAME_ID];
    if (MODE === "ui" && loadScenario !== undefined) {
      void loadScenario().then((resolved) => setScenario(() => resolved));
    }
  }, []);
  if (playable === null) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-950 text-sm text-neutral-400">
        Loading game…
      </div>
    );
  }
  if (MODE === "ui") return <GameUiPreview playable={playable} scenario={scenario} />;
  return <GamePlayerShell playable={playable} multiplayer={multiplayer} />;
}

createRoot(document.getElementById("root")!).render(<DevApp />);
