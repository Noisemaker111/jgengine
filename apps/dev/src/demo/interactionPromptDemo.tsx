import { type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createPromptRegistry } from "@jgengine/core/interaction/promptRegistry";
import { keybind, proximityPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type {
  GameContext,
  GameContextEntityEntry,
  GameContextObjectEntry,
} from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { useGameStore, localPlayerEntity } from "@jgengine/react/hooks";
import { InteractionPrompt } from "@jgengine/react/interactionPrompt";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const HERO = "hero";
const CHEST = "chest";
const DOOR = "door";
const LEVER = "lever";

// Free-string interactable kinds the game owns — the registry never interprets
// them; it only carries the position + display through the resolver.
interface Interactable {
  id: string;
  catalog: string;
  x: number;
  z: number;
  radius: number;
  priority: number;
  label: string;
  accent: string;
}

const INTERACTABLES: readonly Interactable[] = [
  { id: "chest-1", catalog: CHEST, x: 0, z: -3, radius: 4.5, priority: 1, label: "Open", accent: "#fbbf24" },
  { id: "door-1", catalog: DOOR, x: 13, z: 2, radius: 4.5, priority: 1, label: "Enter", accent: "#38bdf8" },
  { id: "lever-1", catalog: LEVER, x: -11, z: 9, radius: 4.5, priority: 1, label: "Pull", accent: "#4ade80" },
];

// One shared registry the world seeds and the HUD renders against.
const registry = createPromptRegistry();
for (const spot of INTERACTABLES) {
  registry.register({
    id: spot.id,
    position: { x: spot.x, z: spot.z },
    priority: spot.priority,
    prompt: proximityPrompt({ radius: spot.radius, display: keybind("interact", spot.label) }),
  });
}

// Accent per active interactable, chosen by the game from the prompt id — the
// registry stays genre-agnostic and never colors anything itself.
const ACCENT_BY_ID: Record<string, string> = Object.fromEntries(INTERACTABLES.map((s) => [s.id, s.accent]));

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 70, d: 70 }, height: 2, frequency: 0.03, seed: "prompt" }),
  vegetation: grass({ area: { w: 60, d: 60 }, density: 3, colors: ["#26401a", "#7fb04a"], seed: "prompt" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [HERO]: { movement: { walkSpeed: 6 }, role: "player" },
};

const objectCatalog: Record<string, GameContextObjectEntry> = {
  [CHEST]: {},
  [DOOR]: {},
  [LEVER]: {},
};

const game = defineGameDefinition({
  name: "interaction-prompt",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onInit(ctx: GameContext): void {
  for (const spot of INTERACTABLES) ctx.scene.object.place(spot.catalog, spot.x, 0, spot.z);
}

function onNewPlayer(ctx: GameContext): void {
  // Spawn the hero already inside the chest's radius so the "Press [E] Open"
  // callout is visible the moment the scene renders.
  ctx.scene.entity.spawn(HERO, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

/** Reads the live hero ground position and drives the registry's resolve as it moves. */
function PromptLayer(): ReactNode {
  const position = useGameStore(
    (ctx) => {
      const hero = localPlayerEntity(ctx);
      return hero === null ? { x: 0, z: 0 } : { x: hero.position[0], z: hero.position[2] };
    },
    (a, b) => a.x === b.x && a.z === b.z,
  );
  return (
    <InteractionPrompt
      registry={registry}
      playerPosition={position}
      accentFor={(prompt) => ACCENT_BY_ID[prompt.id]}
      keyFor={() => "E"}
    />
  );
}

function InteractionPromptUI(): ReactNode {
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div className="absolute left-4 top-4 rounded-lg border border-cyan-300/25 bg-neutral-900/80 px-4 py-3 shadow-xl backdrop-blur-sm">
        <h1 className="text-sm font-semibold tracking-wide text-cyan-200">Interaction Prompts</h1>
        <p className="text-xs text-white/60">
          Walk with <span className="text-cyan-300">WASD</span> — the nearest interactable shows its "Press E" callout.
        </p>
      </div>
      <PromptLayer />
    </div>
  );
}

export const interactionPromptDemoGame: PlayableGame = {
  game,
  content: {
    entityById: (catalogId) => entityCatalog[catalogId] ?? null,
    objectById: (catalogId) => objectCatalog[catalogId] ?? null,
  },
  loop: { onInit, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: InteractionPromptUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 24, initialHeight: 18, minDistance: 12, maxDistance: 52, targetHeight: 0, maxPolarAngle: 1.3 },
};
