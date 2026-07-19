import { type CSSProperties, type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createDialogueRun, type DialogueGraph } from "@jgengine/core/game/dialogueGraph";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { DialogueView } from "@jgengine/react/dialogueView";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const TRAVELER = "traveler";

// A small branching conversation authored with the engine's dialogue-graph model.
const conversation: DialogueGraph = {
  start: "greet",
  nodes: [
    {
      id: "greet",
      speaker: "Marco",
      speakerKind: "merchant",
      portrait: "🧑‍🌾",
      text: "You've got the road-dust of somewhere far off. What brings you to my stall, traveler?",
      choices: [
        { text: "Show me your finest wares.", to: "wares", kind: "neutral" },
        { text: "I'm hunting the ruins to the north.", to: "ruins", kind: "quest" },
        { text: "Just looking, thanks.", to: "farewell", kind: "leave" },
      ],
    },
    {
      id: "wares",
      speaker: "Marco",
      speakerKind: "merchant",
      portrait: "🧑‍🌾",
      text: "Spiced salt, star-iron nails, a lantern that never gutters. Coin talks — what'll it be?",
      choices: [
        { text: "The lantern. How much?", to: "lantern", kind: "buy" },
        { text: "Actually — tell me about the ruins.", to: "ruins", kind: "quest" },
        { text: "Maybe another time.", to: "farewell", kind: "leave" },
      ],
    },
    {
      id: "ruins",
      speaker: "Marco",
      speakerKind: "merchant",
      portrait: "🧑‍🌾",
      text: "The old keep? Folk who go don't come back with their wits. Take my lantern — you'll want the light.",
      choices: [
        { text: "Sold. I'll take the lantern.", to: "lantern", kind: "buy" },
        { text: "I'll manage in the dark.", to: "farewell", kind: "leave" },
      ],
    },
    {
      id: "lantern",
      speaker: "Marco",
      speakerKind: "merchant",
      portrait: "🧑‍🌾",
      text: "Twelve silver, and worth every piece. Safe travels — mind the north road after dusk.",
    },
    {
      id: "farewell",
      speaker: "Marco",
      speakerKind: "merchant",
      portrait: "🧑‍🌾",
      text: "Suit yourself. The stall's here till the harvest fair ends.",
    },
  ],
};

const run = createDialogueRun(conversation);

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 2, frequency: 0.03, seed: "dialogue" }),
  vegetation: grass({ area: { w: 52, d: 52 }, density: 3, colors: ["#3a5220", "#93c14e"], seed: "dialogue" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [TRAVELER]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "dialogue",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(TRAVELER, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

const portraitStyle: CSSProperties = { fontSize: 40, lineHeight: 1 };

function DialogueUI(): ReactNode {
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 28,
          transform: "translateX(-50%)",
          width: "min(560px, calc(100vw - 32px))",
        }}
      >
        <DialogueView
          run={run}
          renderPortrait={(portrait) => (portrait !== undefined ? <span style={portraitStyle}>{portrait}</span> : null)}
          onClose={() => run.reset()}
          closeLabel="Farewell"
        />
      </div>
    </div>
  );
}

export const dialogueDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: DialogueUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 26, initialHeight: 20, minDistance: 12, maxDistance: 52, targetHeight: 0, maxPolarAngle: 1.3 },
};
