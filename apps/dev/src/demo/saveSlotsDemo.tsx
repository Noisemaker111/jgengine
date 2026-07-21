import { useMemo, useRef, type CSSProperties, type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createSaveSlots, type SaveSlotMeta } from "@jgengine/core/game/saveSlots";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { SaveSlotMenu } from "@jgengine/react/saveSlots";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const HERO = "hero";

// A fixed clock so relative "saved" times are stable in the screenshot.
const NOW = 1_000_000_000_000;

// Pre-fill the index on mount: two filled slots (each with a different free-string
// meta bag the menu renders as chips) and one empty "New Game" slot.
function seedSlots() {
  const model = createSaveSlots({ capacity: 3, now: () => NOW });
  model.write("slot-1", {
    name: "Kestrel",
    meta: { chapter: "The Drowned Keep", playtime: "4h 12m", level: 8 },
  });
  // Backdate its savedAt so slot-2 is the most recent (Continue targets it).
  model.restore({
    capacity: 3,
    slots: model.list().map((s) => (s.id === "slot-1" ? { ...s, savedAt: NOW - 3 * 60 * 60 * 1000 } : s)),
  });
  model.write("slot-2", {
    name: "Ronin",
    meta: { region: "Ashfall Steppe", playtime: "11h 03m", level: 21, gold: 4820 },
  });
  return model;
}

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 2, frequency: 0.03, seed: "save-slots" }),
  vegetation: grass({ area: { w: 52, d: 52 }, density: 3, colors: ["#1f2937", "#334155"], seed: "save-slots" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [HERO]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "save-slots",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(HERO, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

const scrim: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "radial-gradient(120% 120% at 50% 20%, rgba(6,10,18,0.55), rgba(4,6,12,0.85))",
};

function SaveSlotsUI(): ReactNode {
  // One model instance for the life of the mount.
  const modelRef = useRef<ReturnType<typeof seedSlots> | null>(null);
  if (modelRef.current === null) modelRef.current = seedSlots();
  const model = modelRef.current;

  const metaIcons = useMemo(
    () => ({ level: "star" as const, playtime: "hourglass" as const, gold: "coin" as const }),
    [],
  );

  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div style={scrim}>
        <SaveSlotMenu
          model={model}
          title="Chronicles of Ash — Load Game"
          now={() => NOW}
          metaIcons={metaIcons}
          onContinue={(slot: SaveSlotMeta) => model.write(slot.id)}
          onLoad={(slot: SaveSlotMeta) => model.write(slot.id)}
          onNew={(slot: SaveSlotMeta) =>
            model.write(slot.id, { name: "New Hero", meta: { chapter: "Prologue", level: 1 } })
          }
          onDelete={(slot: SaveSlotMeta) => model.clear(slot.id)}
        />
      </div>
    </div>
  );
}

export const saveSlotsDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: SaveSlotsUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 26, initialHeight: 20, minDistance: 12, maxDistance: 52, targetHeight: 0, maxPolarAngle: 1.3 },
};
