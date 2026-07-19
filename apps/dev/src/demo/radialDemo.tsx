import { useState } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { QuickMenu, type QuickMenuItem, type QuickMenuLayout } from "@jgengine/react/quickMenu";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const SCOUT = "scout";

const ITEMS: readonly QuickMenuItem[] = [
  { id: "sword", label: "Sword", icon: "⚔️", hotkey: "1", section: "Weapons" },
  { id: "bow", label: "Bow", icon: "🏹", hotkey: "2", badge: 12, section: "Weapons" },
  { id: "bomb", label: "Bomb", icon: "💣", hotkey: "3", badge: 3, section: "Weapons" },
  {
    id: "spells",
    label: "Spells",
    icon: "🔮",
    section: "Magic",
    children: [
      { id: "fireball", label: "Fireball", icon: "🔥", hotkey: "Q" },
      { id: "heal", label: "Heal", icon: "✨", cooldown: 0.45 },
      { id: "shield", label: "Shield", icon: "🛡️" },
    ],
  },
  { id: "potion", label: "Potion", icon: "🧪", badge: 5, section: "Magic" },
  {
    id: "emote",
    label: "Emote",
    icon: "😀",
    section: "Social",
    children: [
      { id: "wave", label: "Wave", icon: "👋" },
      { id: "dance", label: "Dance", icon: "🕺" },
    ],
  },
];

const LAYOUTS: readonly QuickMenuLayout[] = ["radial", "arc", "list", "grid"];

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 2, frequency: 0.03, seed: "radial" }),
  vegetation: grass({ area: { w: 52, d: 52 }, density: 3, colors: ["#2f4f1e", "#8fbf4a"], seed: "radial" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [SCOUT]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "quick-menu",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(SCOUT, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

function QuickMenuUI() {
  const [layout, setLayout] = useState<QuickMenuLayout>("radial");
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div className="pointer-events-auto absolute left-4 top-4 flex flex-col gap-2">
        <div className="flex gap-1 rounded-md border border-white/15 bg-neutral-900/85 p-1">
          {LAYOUTS.map((form) => (
            <button
              key={form}
              type="button"
              onClick={() => setLayout(form)}
              className={`rounded px-2.5 py-1 text-[12px] font-semibold uppercase ${
                layout === form ? "bg-sky-400/25 text-sky-200" : "text-white/55 hover:text-white/80"
              }`}
            >
              {form}
            </button>
          ))}
        </div>
        <div className="rounded-md border border-white/15 bg-neutral-900/80 px-3 py-2 text-[11px] text-white/70">
          Quick menu — one item model, many forms. {selected !== null ? `Chose: ${selected}` : "Pick an action (Spells/Emote nest)."}
        </div>
      </div>
      <div className="pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <QuickMenu items={ITEMS} layout={layout} title="Actions" onSelect={setSelected} radialSize={320} />
      </div>
    </div>
  );
}

export const radialDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: QuickMenuUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 26, initialHeight: 20, minDistance: 12, maxDistance: 52, targetHeight: 0, maxPolarAngle: 1.3 },
};
