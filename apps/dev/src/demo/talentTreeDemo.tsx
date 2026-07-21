import { useReducer, useState, type CSSProperties, type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createTalentTree, type TalentNodeDef } from "@jgengine/core/game/talents";
import { talentTreeViewFrom } from "@jgengine/core/game/talentTreeView";
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

const iconOf = (id: string): GameIconName | null =>
  NODES.find((n) => n.id === id)?.icon ?? UPGRADES.find((n) => n.id === id)?.icon ?? null;
const labelOf = (id: string): string =>
  NODES.find((n) => n.id === id)?.label ?? UPGRADES.find((n) => n.id === id)?.label ?? id;

// The shared tree instance, seeded so some nodes are learned, some available, some locked at settle.
const tree = createTalentTree<Stat>({ points: 12, nodes: NODES });
tree.allocate("strike"); // strike 1/3 (learned)
tree.allocate("strike"); // strike 2/3 → unlocks cleave
tree.allocate("guard"); // guard 1/2 (learned)
tree.allocate("cleave"); // cleave 1/2 (learned)
tree.allocate("spark"); // spark 1/3 → unlocks focus + flux

// ── A second tree over the SAME widget with NO point currency ──────────────────────────
// An "upgrade" tree unlocked by earned cash + milestones (not bought with talent points): each node
// lights up when you can afford it and its prerequisite is unlocked, and clicking *unlocks* it — the
// effect is the game's (go faster, +% payout, a new ability), the widget just renders any unlock rule.
const UPGRADES: readonly (TalentNodeDef & { label: string; icon: GameIconName; cost: number })[] = [
  { id: "sprint", branch: "Hustle", maxRank: 1, icon: "sprint", label: "Sprint (go faster)", cost: 50 },
  { id: "payout", branch: "Hustle", maxRank: 1, requires: ["sprint"], icon: "coin", label: "Payout +10%", cost: 120 },
  { id: "dash", branch: "Hustle", maxRank: 1, requires: ["payout"], icon: "wing", label: "Dash (new ability)", cost: 300 },
];
const UPGRADE_COST: Record<string, number> = Object.fromEntries(UPGRADES.map((u) => [u.id, u.cost]));

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

const rowStyle: CSSProperties = {
  position: "absolute",
  top: 24,
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  gap: 18,
  alignItems: "flex-start",
  pointerEvents: "auto",
};

function UpgradeTree(): ReactNode {
  // Game-owned unlock state: earned cash + which upgrades are unlocked so far. No talent points.
  const [gold, setGold] = useState(150);
  const [unlocked, setUnlocked] = useState<ReadonlySet<string>>(new Set(["sprint"]));

  // Build the render view from OUR rule: a node is takeable when affordable, its prereq is unlocked,
  // and it isn't already unlocked. rank 1 = unlocked. No points model involved.
  const view = talentTreeViewFrom(UPGRADES, (node) => {
    const has = unlocked.has(node.id);
    const prereqMet = (node.requires ?? []).every((r) => unlocked.has(typeof r === "string" ? r : r.nodeId));
    return { rank: has ? 1 : 0, allocatable: !has && prereqMet && gold >= UPGRADE_COST[node.id]! };
  });

  return (
    <TalentTree
      view={view}
      title={`Upgrades · ${gold}g`}
      showPoints={false}
      icon={iconOf}
      label={labelOf}
      branchLabel={() => "Earned, not bought"}
      onLearn={(id) => {
        setGold((g) => g - UPGRADE_COST[id]!);
        setUnlocked((prev) => new Set(prev).add(id));
      }}
    />
  );
}

function TalentTreeUI(): ReactNode {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div style={rowStyle}>
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
        <UpgradeTree />
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
