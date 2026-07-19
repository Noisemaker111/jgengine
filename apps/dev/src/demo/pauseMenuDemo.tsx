import { type CSSProperties, type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createModalStack, MODAL_CONFIRM } from "@jgengine/core/ui/modalStack";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { ConfirmDialog, ModalHost, PauseMenu } from "@jgengine/react/modals";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const HERO = "hero";

/**
 * A game-owned modal stack. The pause menu is pushed at module init so the overlay is visibly open
 * when the demo settles. The game — not the engine — decides the `kind` vocabulary (`"pause"` /
 * `"confirm"`) and switches on it in the {@link ModalHost} render callback.
 */
const modals = createModalStack();
modals.push({ kind: "pause" });

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 2, frequency: 0.03, seed: "pause" }),
  vegetation: grass({ area: { w: 52, d: 52 }, density: 3, colors: ["#2f4f1e", "#8fbf4a"], seed: "pause" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [HERO]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "pause-menu",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(HERO, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

const hint: CSSProperties = {
  position: "absolute",
  top: 18,
  left: "50%",
  transform: "translateX(-50%)",
  padding: "6px 14px",
  borderRadius: 999,
  background: "rgba(17,22,30,0.8)",
  color: "#e2e8f0",
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: 0.3,
};

function PauseMenuUI(): ReactNode {
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div style={hint}>Press Esc / click Resume to close — Quit opens a confirm dialog</div>
      <ModalHost stack={modals}>
        {(record, controls) => {
          if (record.kind === "confirm") {
            return (
              <ConfirmDialog
                title="Quit to main menu?"
                body="You'll lose any unsaved progress in the current run."
                confirmLabel="Quit"
                cancelLabel="Stay"
                danger
                onConfirm={() => controls.resolve(MODAL_CONFIRM)}
                onCancel={() => controls.cancel()}
              />
            );
          }
          return (
            <PauseMenu
              title="Paused"
              onResume={() => controls.cancel()}
              items={[
                { id: "settings", label: "Settings", onSelect: () => {} },
                { id: "save", label: "Save Game", onSelect: () => {} },
                { id: "quit", label: "Quit to Menu", danger: true, onSelect: () => modals.push({ kind: "confirm" }) },
              ]}
            />
          );
        }}
      </ModalHost>
    </div>
  );
}

export const pauseMenuDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: PauseMenuUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 26, initialHeight: 20, minDistance: 12, maxDistance: 52, targetHeight: 0, maxPolarAngle: 1.3 },
};
