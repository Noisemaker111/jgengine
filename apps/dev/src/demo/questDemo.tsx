import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createQuestJournal, describeTrackedQuest, type QuestDef, type QuestJournal } from "@jgengine/core/game/quest";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { QuestTracker } from "@jgengine/react/questTracker";
import { usePlayer, useSceneEntities } from "@jgengine/react/hooks";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const SCOUT = "scout";

const QUEST: QuestDef = {
  id: "clear-the-ridge",
  title: "Clear the Ridge",
  objectives: [
    { id: "wolves", kind: "kill", target: "Wolves", count: 5 },
    { id: "herbs", kind: "collect", item: "Moonpetal", count: 3 },
    { id: "overlook", kind: "reach", target: "the overlook", count: 1 },
  ],
};

const SIDE_QUEST: QuestDef = {
  id: "salvage",
  title: "Salvage Run",
  objectives: [{ id: "crates", kind: "collect", item: "supply crate", count: 4 }],
};

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 70, d: 70 }, height: 3, frequency: 0.03, seed: "quest" }),
  vegetation: grass({ area: { w: 60, d: 60 }, density: 3, colors: ["#2f4f1e", "#8fbf4a"], seed: "quest" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [SCOUT]: { movement: { walkSpeed: 6 }, role: "player" },
};

let journal: QuestJournal | null = null;

const game = defineGameDefinition({
  name: "quest-tracker",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onInit(ctx: GameContext): void {
  journal = createQuestJournal({
    events: ctx.game.events,
    rewards: {
      grantXp: () => {},
      grantEconomy: () => {},
      grantItem: () => null,
      grantUnlock: () => {},
    },
  });
  journal.register([QUEST, SIDE_QUEST]);
}

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(SCOUT, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
  if (journal === null) return;
  const user = ctx.player.userId;
  journal.accept(user, QUEST.id);
  journal.accept(user, SIDE_QUEST.id);
  // A representative mixed state: partway on wolves, herbs done, overlook untouched.
  journal.progress(user, QUEST.id, "wolves", 3);
  journal.progress(user, QUEST.id, "herbs", 3);
  journal.progress(user, SIDE_QUEST.id, "crates", 1);
}

function QuestUI() {
  const player = usePlayer();
  useSceneEntities(); // re-render as the world ticks
  const quests = journal === null ? [] : journal.list(player.userId).map((instance) => {
    const def = instance.questId === SIDE_QUEST.id ? SIDE_QUEST : QUEST;
    return describeTrackedQuest(def, instance);
  });
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div className="absolute right-4 top-4">
        <QuestTracker quests={quests} accent="#facc15" />
      </div>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-white/15 bg-neutral-900/80 px-3 py-2 text-[11px] text-white/70">
        Quest tracker HUD over the core quest journal — objective progress, completion, and a side quest.
      </div>
    </div>
  );
}

export const questDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: QuestUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 28, initialHeight: 22, minDistance: 12, maxDistance: 56, targetHeight: 0, maxPolarAngle: 1.3 },
};
