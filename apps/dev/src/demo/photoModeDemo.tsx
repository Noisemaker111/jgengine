import { useRef } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { createPhotoModeStore } from "@jgengine/core/ui/photoMode";
import { PhotoModeControls, usePhotoMode } from "@jgengine/react/photoMode";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import { SceneCaptureBinding, downloadImage } from "@jgengine/shell/render/sceneCapture";
import type { PlayableGame } from "@jgengine/shell/registry";

const SCOUT = "scout";

const store = createPhotoModeStore({ active: false, hideHud: true });
let captureFn: (() => string | null) | null = null;

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 80, d: 80 }, height: 4, frequency: 0.03, seed: "photo" }),
  vegetation: grass({ area: { w: 68, d: 68 }, density: 4, colors: ["#2f4f1e", "#8fbf4a"], seed: "photo" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [SCOUT]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "photo-mode",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(SCOUT, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

function GameHud() {
  return (
    <div className="absolute inset-x-0 bottom-4 flex items-end justify-between px-4">
      <div className="rounded-lg border border-white/15 bg-neutral-900/80 px-4 py-3 text-white">
        <div className="text-xs uppercase tracking-widest text-white/45">Vitals</div>
        <div className="mt-1 h-2 w-40 overflow-hidden rounded-full bg-white/15">
          <div className="h-full w-3/4 bg-emerald-400" />
        </div>
        <div className="mt-1 h-2 w-40 overflow-hidden rounded-full bg-white/15">
          <div className="h-full w-1/2 bg-sky-400" />
        </div>
      </div>
      <div className="rounded-lg border border-white/15 bg-neutral-900/80 px-4 py-3 font-mono text-lg text-white">12:480</div>
    </div>
  );
}

function PhotoUI() {
  const state = usePhotoMode(store);
  const busy = useRef(false);
  const capture = (): void => {
    if (busy.current) return;
    busy.current = true;
    // Let the HUD hide for a clean frame before grabbing it.
    requestAnimationFrame(() => {
      const url = captureFn?.();
      if (url !== null && url !== undefined) downloadImage(url, "photo-mode.png");
      busy.current = false;
    });
  };
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      {state.active && state.hideHud ? null : <GameHud />}
      {state.active ? (
        <div className="pointer-events-auto absolute left-1/2 top-6 -translate-x-1/2">
          <PhotoModeControls store={store} onCapture={capture} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => store.enter()}
          className="pointer-events-auto absolute right-4 top-4 rounded-lg border border-white/15 bg-neutral-900/80 px-3 py-2 text-[13px] font-semibold text-white/85 hover:text-white"
        >
          📷 Photo Mode
        </button>
      )}
    </div>
  );
}

export const photoModeDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: PhotoUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  WorldOverlay: () => <SceneCaptureBinding bind={(fn) => { captureFn = fn; }} />,
  camera: { initialDistance: 30, initialHeight: 24, minDistance: 12, maxDistance: 60, targetHeight: 0, maxPolarAngle: 1.3 },
};
