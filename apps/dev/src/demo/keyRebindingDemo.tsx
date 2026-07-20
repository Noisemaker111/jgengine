import { useMemo, type CSSProperties, type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createRebindSession } from "@jgengine/core/input/rebindSession";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { KeybindingMenu } from "@jgengine/react/keybindingMenu";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const HERO = "hero";

// Free-string action ids/labels the session never interprets — the game owns them.
const ACTIONS = [
  { id: "moveForward", label: "Move Forward", defaultCodes: ["KeyW"] as string[] },
  { id: "jump", label: "Jump", defaultCodes: ["Space"] as string[] },
  { id: "interact", label: "Interact", defaultCodes: ["KeyE"] as string[] },
  { id: "reload", label: "Reload", defaultCodes: ["KeyR"] as string[] },
  { id: "sprint", label: "Sprint", defaultCodes: { hold: ["ShiftLeft"] } },
  { id: "map", label: "Map", defaultCodes: ["KeyM"] as string[] },
];

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 2, frequency: 0.03, seed: "rebind" }),
  vegetation: grass({ area: { w: 52, d: 52 }, density: 3, colors: ["#1c3320", "#5f9a55"], seed: "rebind" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [HERO]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "key-rebinding",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(HERO, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

const wrap: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
};

function KeyRebindingUI(): ReactNode {
  // A seeded override rebinds Reload onto KeyE, colliding with Interact so the
  // controls list shows a conflict badge in the initial frame.
  const session = useMemo(
    () => createRebindSession({ actions: ACTIONS, overrides: { reload: ["KeyE"] } }),
    [],
  );

  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white" style={wrap}>
      <KeybindingMenu session={session} title="Controls — Key Bindings" style={{ pointerEvents: "auto" }} />
    </div>
  );
}

export const keyRebindingDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: KeyRebindingUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 26, initialHeight: 20, minDistance: 12, maxDistance: 52, targetHeight: 0, maxPolarAngle: 1.3 },
};
