import { buildCatalog } from "@jgengine/assets";
import { defineGame } from "@jgengine/core/game/defineGame";
import type { ModelConfig, PlayableGame } from "@jgengine/core/game/playableGame";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { ComponentType } from "react";

const HERO = "wanderer";

const catalog = buildCatalog({ basePath: "/models" });

function modelFor(id: string, extra: Omit<ModelConfig, "url"> = {}): ModelConfig {
  const asset = catalog.resolve(id);
  if (asset === null) throw new Error(`asset-showcase: missing catalog id ${id}`);
  return { url: asset.url, ...extra };
}

const PROPS: readonly { id: string; scale?: number }[] = [
  { id: "kenney-nature/tree_pineDefaultA" },
  { id: "kenney-nature/tree_pineDefaultB" },
  { id: "kenney-nature/tree_blocks" },
  { id: "kenney-nature/tree_cone_dark" },
  { id: "kenney-nature/tree_thin" },
  { id: "kenney-nature/cliff_block_rock" },
  { id: "kenney-nature/mushroom_red", scale: 1.6 },
  { id: "kenney-nature/mushroom_redGroup", scale: 1.6 },
  { id: "kenney-nature/flower_purpleA", scale: 2 },
  { id: "kenney-nature/statue_head" },
];

const objectModels: Record<string, ModelConfig> = Object.fromEntries(
  PROPS.filter((prop) => catalog.has(prop.id)).map((prop) => [
    prop.id,
    modelFor(prop.id, { scale: prop.scale ?? 1.4 }),
  ]),
);

const entityModels: Record<string, ModelConfig> = {
  [HERO]: modelFor("kenney-space/astronautA", { scale: 1.1 }),
};

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [HERO]: {
    stats: { health: { max: 100 } },
    receive: { damage: { order: ["health"] } },
    movement: { poses: ["standing", "running"], walkSpeed: 3 },
  },
};

const game = defineGame({
  name: "asset-showcase",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: {
    moveForward: ["KeyW"],
    moveBack: ["KeyS"],
    moveLeft: ["KeyA"],
    moveRight: ["KeyD"],
    turnLeft: ["KeyQ"],
    turnRight: ["KeyE"],
    sprint: ["Shift"],
    jump: ["Space"],
  },
});

function placeProps(ctx: GameContext): void {
  const ids = Object.keys(objectModels);
  ids.forEach((id, index) => {
    const angle = (index / ids.length) * Math.PI * 2;
    const radius = 4.5;
    ctx.scene.object.place(id, Math.cos(angle) * radius, 0, Math.sin(angle) * radius, {
      rotation: angle,
    });
  });
}

function onInit(): void {}

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(HERO, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
  placeProps(ctx);
}

function onTick(): void {}

function ShowcaseUI() {
  return (
    <div className="pointer-events-none absolute inset-0 font-mono text-white">
      <div className="absolute left-4 top-4 rounded bg-black/60 px-3 py-2 text-xs leading-5">
        <div className="font-semibold text-emerald-300">@jgengine/assets — CC0 render proof</div>
        <div className="text-white/70">
          {Object.keys(objectModels).length} Kenney nature models · astronaut via entityModels
        </div>
      </div>
      <div className="absolute bottom-4 left-4 text-[11px] text-white/40">WASD move · Q/E turn</div>
    </div>
  );
}

export const assetShowcaseGame: PlayableGame<ComponentType, ComponentType> = {
  game,
  content: {
    entityById: (catalogId) => entityCatalog[catalogId] ?? null,
    itemById: () => null,
  },
  loop: { onInit, onNewPlayer, onTick },
  GameUI: ShowcaseUI,
  entityModels,
  objectModels,
  camera: {
    minDistance: 6,
    maxDistance: 40,
    initialDistance: 11,
    initialHeight: 5,
    targetHeight: 1.5,
  },
};

export default assetShowcaseGame;
