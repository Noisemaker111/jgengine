import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { GamePlayerShell } from "@jgengine/shell/GamePlayerShell";
import { GameUiPreview, type UiPreviewScenario } from "@jgengine/shell/GameUiPreview";
import { resolveShellMultiplayer, type ShellMultiplayer } from "@jgengine/shell/multiplayer";
import type { GameRegistry, PlayableGame } from "@jgengine/shell/registry";

import "./index.css";

const gameRegistry: GameRegistry = {
  demo: () => import("@jgengine/shell/demo/demoGame").then((module) => module.demoGame),
  "pointer-commander": () =>
    import("@jgengine/shell/demo/pointerDemo").then((module) => module.pointerDemoGame),
  "environment-showcase": () =>
    import("@jgengine/shell/demo/environmentShowcase").then((module) => module.environmentShowcaseGame),
  "survival-demo": () =>
    import("@jgengine/shell/demo/survivalDemo").then((module) => module.survivalDemoGame),
  "builder-sandbox": () =>
    import("@jgengine/shell/demo/builderDemo").then((module) => module.builderDemoGame),
  "extraction-map": () => import("@jgengine/shell/demo/mapDemo").then((module) => module.mapDemoGame),
  "world-of-warcraft": () => import("@dogfood/world-of-warcraft").then((module) => module.wowGame),
  "asset-showcase": () =>
    import("@dogfood/asset-showcase").then((module) => module.assetShowcaseGame),
  "loot-shooter": () => import("@dogfood/loot-shooter").then((module) => module.lootShooterGame),
  "stress-bench": () => import("@dogfood/stress-bench").then((module) => module.stressBenchGame),
};

const uiScenarioRegistry: Partial<Record<string, () => Promise<UiPreviewScenario>>> = {
  "world-of-warcraft": () =>
    import("@dogfood/world-of-warcraft/ui/uiPreviewScenario").then(
      (module) => module.interactionShowcaseScenario,
    ),
};

const urlParams = new URLSearchParams(window.location.search);
const GAME_ID =
  urlParams.get("game") ??
  (import.meta.env.VITE_GAME_ID as string | undefined) ??
  "world-of-warcraft";
const MODE = urlParams.get("mode") ?? "play";
const WS_URL = import.meta.env.VITE_JG_WS_URL as string | undefined;

function DevApp() {
  const [playable, setPlayable] = useState<PlayableGame | null>(null);
  const [multiplayer, setMultiplayer] = useState<ShellMultiplayer | null>(null);
  const [scenario, setScenario] = useState<UiPreviewScenario | undefined>(undefined);
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
      setPlayable(loaded);
    });
    const loadScenario = uiScenarioRegistry[GAME_ID];
    if (loadScenario !== undefined) void loadScenario().then((loaded) => setScenario(() => loaded));
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
