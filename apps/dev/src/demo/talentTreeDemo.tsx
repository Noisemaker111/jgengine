import { useReducer, type CSSProperties, type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createTalentTree, type TalentNodeDef } from "@jgengine/core/game/talents";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { TalentTree } from "@jgengine/react/talentTree";
import type { GameIconName } from "@jgengine/react/gameIcons";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const HERO = "hero";

type Stat = "power" | "critChance" | "haste";

// A small sample tree: two branches, a few tiers, string + ranked prerequisites, and a
// cross-branch requirement so the widget shows edges, tiers, and every node state at once.
const NODES: readonly (TalentNodeDef<Stat> & { label: string; icon: GameIconName })[] = [
  { id: "strike", branch: "Might", maxRank: 3, icon: "sword", label: "Strike", modifiersPerRank: { power: { add: 4 } } },
  { id: "guard", branch: "Might", maxRank: 2, icon: "shield", label: "Guard" },
  { id: "cleave", branch: "Might", maxRank: 2, requires: [{ nodeId: "strike", rank: 2 }], icon: "axe", label: "Cleave" },
  { id: "rampage", branch: "Might", maxRank: 1, requires: ["cleave", "guard"], icon: "fist", label: "Rampage" },

  { id: "spark", branch: "Arcane", maxRank: 3, icon: "lightning", label: "Spark", modifiersPerRank: { critChance: { add: 0.02 } } },
  { id: "focus", branch: "Arcane", maxRank: 2, requires: ["spark"], icon: "eye", label: "Focus" },
  { id: "flux", branch: "Arcane", maxRank: 2, requires: ["spark"], icon: "hourglass", label: "Flux", modifiersPerRank: { haste: { add: 0.05 } } },
  { id: "overload", branch: "Arcane", maxRank: 1, requires: [{ nodeId: "focus", rank: 2 }, "flux"], icon: "fire", label: "Overload" },
];

const iconOf = (id: string): GameIconName | null => NODES.find((n) => n.id === id)?.icon ?? null;
const labelOf = (id: string): string => NODES.find((n) => n.id === id)?.label ?? id;

// The shared tree instance, seeded so some nodes are learned, some available, some locked at settle.
const tree = createTalentTree<Stat>({ points: 12, nodes: NODES });
tree.allocate("strike"); // strike 1/3 (learned)
tree.allocate("strike"); // strike 2/3 → unlocks cleave
tree.allocate("guard"); // guard 1/2 (learned)
tree.allocate("cleave"); // cleave 1/2 (learned)
tree.allocate("spark"); // spark 1/3 → unlocks focus + flux

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 2, frequency: 0.03, seed: "talent" }),
  vegetation: grass({ area: { w: 52, d: 52 }, density: 3, colors: ["#243b1e", "#5f8f3a"], seed: "talent" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [HERO]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "talent-tree",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(HERO, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

const panelStyle: CSSProperties = {
  position: "absolute",
  top: 24,
  left: "50%",
  transform: "translateX(-50%)",
  pointerEvents: "auto",
};

function TalentTreeUI(): ReactNode {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div style={panelStyle}>
        <TalentTree<Stat>
          nodes={NODES}
          tree={tree}
          icon={iconOf}
          label={labelOf}
          onLearn={(id) => {
            tree.allocate(id);
            bump();
          }}
        />
      </div>
    </div>
  );
}

export const talentTreeDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: TalentTreeUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 26, initialHeight: 20, minDistance: 12, maxDistance: 52, targetHeight: 0, maxPolarAngle: 1.3 },
};
