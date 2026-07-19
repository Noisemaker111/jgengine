import { useRef, useState } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createNotificationCenter } from "@jgengine/core/game/notifications";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { NotificationBell, NotificationCenter } from "@jgengine/react/notifications";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const SCOUT = "scout";

const store = createNotificationCenter();
let seeded = false;

const SAMPLES: readonly { kind: string; title: string; body?: string; ago: number }[] = [
  { kind: "danger", title: "Under attack!", body: "Raiders spotted near the west gate.", ago: 30 },
  { kind: "success", title: "Trade complete", body: "Sold 3 pelts for 45g.", ago: 240 },
  { kind: "quest", title: "Quest updated", body: "Clear the Ridge — 3/5 wolves.", ago: 900 },
  { kind: "info", title: "Ada joined your party", ago: 3600 },
];

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 2, frequency: 0.03, seed: "notify" }),
  vegetation: grass({ area: { w: 52, d: 52 }, density: 3, colors: ["#2f4f1e", "#8fbf4a"], seed: "notify" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [SCOUT]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "notification-center",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(SCOUT, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
  if (seeded) return;
  seeded = true;
  const now = Date.now();
  for (const sample of [...SAMPLES].reverse()) {
    store.push({ kind: sample.kind, title: sample.title, body: sample.body, at: now - sample.ago * 1000 });
  }
  // The oldest (party join) is already read.
  const oldest = store.list().at(-1);
  if (oldest !== undefined) store.markRead(oldest.id);
}

function NotificationUI() {
  const [open, setOpen] = useState(true);
  const counter = useRef(0);
  const addOne = (): void => {
    counter.current += 1;
    store.push({ kind: "info", title: `Loot found (${counter.current})`, body: "A shiny trinket dropped." });
  };
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div className="pointer-events-auto absolute right-4 top-4 flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={addOne}
            className="rounded-lg border border-white/15 bg-neutral-900/80 px-3 py-2 text-[12px] font-semibold text-white/80 hover:text-white"
          >
            + Notify
          </button>
          <NotificationBell store={store} onClick={() => setOpen((v) => !v)} />
        </div>
        {open ? <NotificationCenter store={store} onClose={() => setOpen(false)} /> : null}
      </div>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-white/15 bg-neutral-900/80 px-3 py-2 text-[11px] text-white/70">
        Notification center — a persistent, read-tracked log behind the bell (the durable side of toasts).
      </div>
    </div>
  );
}

export const notificationDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: NotificationUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 26, initialHeight: 20, minDistance: 12, maxDistance: 52, targetHeight: 0, maxPolarAngle: 1.3 },
};
