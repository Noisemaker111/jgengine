import { defineGame } from "@jgengine/core/game/defineGame";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { biomes } from "@jgengine/core/world/features";
import { terrainFieldFor } from "@jgengine/core/world/terrain";
import { isBiomeField } from "@jgengine/core/world/biomes";
import { usePlayer, useGameStore } from "@jgengine/react/hooks";

import type { PlayableGame } from "../registry";

const HERO = "wanderer";

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [HERO]: {
    stats: { health: { max: 100 } },
    movement: { poses: ["standing", "running"], walkSpeed: 3.4 },
  },
};

const game = defineGame({
  name: "biome-showcase",
  assets: createAssetCatalog(),
  multiplayer: null,
  world: biomes({ seed: "terra" }),
  input: {
    moveForward: ["KeyW"],
    moveBack: ["KeyS"],
    moveLeft: ["KeyA"],
    moveRight: ["KeyD"],
    jump: ["Space"],
    sprint: ["Shift"],
    turnLeft: ["KeyQ"],
    turnRight: ["KeyE"],
  },
});

function spawnHero(ctx: GameContext): void {
  ctx.scene.entity.spawn(HERO, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

function onInit(): void {}

function onNewPlayer(ctx: GameContext): void {
  spawnHero(ctx);
}

function onTick(ctx: GameContext): void {
  if (ctx.scene.entity.get(ctx.player.userId) === null) spawnHero(ctx);
}

const field = terrainFieldFor(game.world);

function BiomeReadout() {
  const { userId } = usePlayer();
  const position = useGameStore((ctx) => ctx.scene.entity.get(userId)?.position ?? null);
  if (position === null || !isBiomeField(field)) return null;
  const sample = field.sampleBiome(position[0], position[2]);
  const effects = sample.effects.map((effect) => effect.kind).join(", ");
  return (
    <div className="rounded bg-black/60 px-3 py-2 text-white">
      <p className="text-sm font-semibold text-emerald-300">{sample.biome.displayName}</p>
      <p className="text-[11px] text-white/60">
        temp {sample.climate.temperature.toFixed(2)} · humidity {sample.climate.humidity.toFixed(2)} · cont{" "}
        {sample.climate.continentalness.toFixed(2)}
      </p>
      {sample.biome.spawns !== undefined ? (
        <p className="text-[11px] text-white/50">spawns: {sample.biome.spawns.map((spawn) => spawn.entity).join(", ")}</p>
      ) : null}
      {effects.length > 0 ? <p className="text-[11px] text-amber-300">effects: {effects}</p> : null}
    </div>
  );
}

function ShowcaseUI() {
  return (
    <div className="pointer-events-none absolute inset-0 font-mono">
      <div className="absolute left-4 top-4 w-64">
        <BiomeReadout />
      </div>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[11px] text-white/40">
        WASD move · Shift sprint · Q/E turn — walk across biomes
      </div>
    </div>
  );
}

export const biomeShowcaseGame: PlayableGame = {
  game,
  camera: { initialDistance: 26, initialHeight: 16, maxDistance: 90, targetHeight: 3 },
  content: {
    itemById: () => null,
    entityById: (catalogId) => entityCatalog[catalogId] ?? null,
  },
  loop: { onInit, onNewPlayer, onTick },
  GameUI: ShowcaseUI,
};
