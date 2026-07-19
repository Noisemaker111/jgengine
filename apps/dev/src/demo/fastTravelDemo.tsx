import { useState } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createFastTravelNetwork } from "@jgengine/core/world/fastTravel";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { FastTravelMenu } from "@jgengine/react/fastTravel";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const WANDERER = "wanderer";

const network = createFastTravelNetwork({
  points: [
    { id: "camp", name: "Wayfarer's Camp", position: [0, 0], region: "The Vale", icon: "🏕️", initial: true },
    { id: "mill", name: "Old Mill", position: [18, -6], region: "The Vale", icon: "🌾" },
    { id: "port", name: "Salt Port", position: [22, 34], region: "Copper Coast", icon: "⚓" },
    { id: "lighthouse", name: "Broken Lighthouse", position: [40, 52], region: "Copper Coast", icon: "🗼" },
    { id: "ridge", name: "Windy Ridge", position: [-34, 40], region: "The Highlands", icon: "🏔️" },
    { id: "keep", name: "Ashen Keep", position: [-52, 58], region: "The Highlands", icon: "🏰" },
  ],
});

let seeded = false;

function FastTravelUI() {
  const [origin, setOrigin] = useState<[number, number]>([0, 0]);
  const [current, setCurrent] = useState("camp");
  const [pending, setPending] = useState<string[]>(["mill", "port", "ridge"]);

  const discoverNext = (): void => {
    setPending((queue) => {
      const [next, ...rest] = queue;
      if (next !== undefined) network.discover(next);
      return rest;
    });
  };

  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div className="pointer-events-auto absolute left-4 top-4">
        <FastTravelMenu
          network={network}
          from={origin}
          currentId={current}
          onTravel={(id, point) => {
            setCurrent(id);
            setOrigin([point.position[0], point.position[1]]);
          }}
        />
      </div>
      <div className="pointer-events-auto absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        <button
          type="button"
          onClick={discoverNext}
          disabled={pending.length === 0}
          className="rounded-lg border border-white/15 bg-neutral-900/80 px-3 py-2 text-[12px] font-semibold text-white/80 hover:text-white disabled:opacity-40"
        >
          {pending.length > 0 ? "Discover next location" : "All nearby locations found"}
        </button>
        <div className="rounded-md border border-white/15 bg-neutral-900/80 px-3 py-2 text-[11px] text-white/70">
          Fast travel — a discovered-destinations network: pick a place to teleport; distances update from where you stand.
        </div>
      </div>
    </div>
  );
}

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 120, d: 120 }, height: 3, frequency: 0.02, seed: "fast-travel" }),
  vegetation: grass({ area: { w: 110, d: 110 }, density: 2, colors: ["#2f4f1e", "#8fbf4a"], seed: "fast-travel" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [WANDERER]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "fast-travel",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(WANDERER, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
  if (seeded) return;
  seeded = true;
  network.discover("port"); // one seeded discovery beyond the initial camp
}

export const fastTravelDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: FastTravelUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 40, initialHeight: 30, minDistance: 16, maxDistance: 72, targetHeight: 0, maxPolarAngle: 1.3 },
};
