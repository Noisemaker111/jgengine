import { useSyncExternalStore } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createCodex, type CodexEntryDef } from "@jgengine/core/game/codex";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { Codex } from "@jgengine/react/codex";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const SCOUT = "scout";

const BESTIARY: readonly CodexEntryDef[] = [
  { id: "wolf", name: "Gray Wolf", category: "Beasts", description: "Pack hunter", icon: "🐺" },
  { id: "boar", name: "Tusk Boar", category: "Beasts", description: "Charges when cornered", icon: "🐗" },
  { id: "bear", name: "Cave Bear", category: "Beasts", description: "Slow but brutal", icon: "🐻" },
  { id: "wisp", name: "Marsh Wisp", category: "Spirits", description: "Lures travelers", icon: "🔮" },
  { id: "dryad", name: "Elder Dryad", category: "Spirits", description: "Guards the grove", icon: "🌳" },
  { id: "wraith", name: "Grave Wraith", category: "Undead", description: "Drains warmth", icon: "👻" },
  { id: "lich", name: "The Pale Lich", category: "Undead", secret: true, icon: "💀", lore: "???" },
];

const codex = createCodex({ entries: BESTIARY });
let seeded = false;

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 2, frequency: 0.03, seed: "codex" }),
  vegetation: grass({ area: { w: 52, d: 52 }, density: 3, colors: ["#2f4f1e", "#8fbf4a"], seed: "codex" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [SCOUT]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "codex",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(SCOUT, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
  if (seeded) return;
  seeded = true;
  for (const id of ["wolf", "boar", "wisp", "wraith"]) codex.discover(id);
}

function useCodexEntries() {
  return useSyncExternalStore(
    (listener) => codex.subscribe(listener),
    () => codex.list(),
    () => codex.list(),
  );
}

function CodexUI() {
  const entries = useCodexEntries();
  const nextHidden = entries.find((entry) => !entry.discovered && entry.secret !== true);
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div className="pointer-events-auto absolute left-1/2 top-6 -translate-x-1/2">
        <Codex entries={entries} title="Bestiary" columns={3} />
      </div>
      <div className="pointer-events-auto absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-md border border-white/15 bg-neutral-900/80 px-3 py-2 text-[11px] text-white/70">
        Codex / bestiary — discovered entries fill in; secret ones stay masked.
        {nextHidden !== undefined ? (
          <button type="button" onClick={() => codex.discover(nextHidden.id)} className="rounded border border-white/20 px-2 py-1 font-semibold text-white/85 hover:text-white">
            Discover {nextHidden.name}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export const codexDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: CodexUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 26, initialHeight: 20, minDistance: 12, maxDistance: 52, targetHeight: 0, maxPolarAngle: 1.3 },
};
