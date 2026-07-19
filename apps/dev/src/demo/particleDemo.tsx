import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createParticleSystem } from "@jgengine/core/vfx/particles";
import { environment, grass, terrain } from "@jgengine/core/world/features";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";
import { ParticleField } from "@jgengine/shell/vfx/ParticleField";

const SCOUT = "scout";

// A rising fire column: fast, short-lived, orange→red, cone-spread upward.
const fire = createParticleSystem({
  seed: "fire",
  max: 500,
  rate: 220,
  position: [-5, 0.4, 0],
  spawnJitter: [0.5, 0, 0.5],
  direction: [0, 1, 0],
  spread: 0.5,
  speed: { min: 2.5, max: 4 },
  gravity: [0, 1.5, 0],
  drag: 0.4,
  lifetime: { min: 0.7, max: 1.3 },
  size: { start: 1.6, end: 0.1 },
  colorStart: 0xffd24a,
  colorEnd: 0xff2a00,
  alpha: { start: 1, end: 0 },
});

// A slow smoke plume drifting up and sideways, grey, growing as it fades.
const smoke = createParticleSystem({
  seed: "smoke",
  max: 260,
  rate: 40,
  position: [0, 1.4, 0],
  spawnJitter: [0.3, 0, 0.3],
  direction: [0.4, 1, 0],
  spread: 0.35,
  speed: { min: 0.8, max: 1.4 },
  gravity: [0.2, 0.3, 0],
  drag: 0.6,
  lifetime: { min: 2.5, max: 4 },
  size: { start: 1.2, end: 4 },
  colorStart: 0xb2b8be,
  colorEnd: 0x40454a,
  alpha: { start: 0.5, end: 0 },
});

// A spark fountain: burst upward and outward, gravity pulls them back down.
const sparks = createParticleSystem({
  seed: "sparks",
  max: 500,
  rate: 220,
  position: [5, 0.3, 0],
  direction: [0, 1, 0],
  spread: 0.9,
  speed: { min: 5, max: 8 },
  gravity: [0, -12, 0],
  lifetime: { min: 0.9, max: 1.6 },
  size: { start: 0.5, end: 0.08 },
  colorStart: 0xfff2b0,
  colorEnd: 0xff8a3a,
  alpha: { start: 1, end: 0 },
});

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 1.5, frequency: 0.03, seed: "particles" }),
  vegetation: grass({ area: { w: 52, d: 52 }, density: 3, colors: ["#2f4f1e", "#6f9f3a"], seed: "particles" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [SCOUT]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "particle-vfx",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(SCOUT, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

function Vfx() {
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-white/15 bg-neutral-900/80 px-3 py-2 text-[11px] text-white/70">
        Generic particle system — one deterministic, pooled emitter each: fire (left), smoke (center), spark fountain (right). All
        data-driven; no combat coupling.
      </div>
    </div>
  );
}

export const particleDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: Vfx,
  environment: () => (
    <>
      <EnvironmentScene feature={terrainFeature} />
      <ParticleField system={fire} blending="additive" scale={500} />
      <ParticleField system={smoke} blending="normal" depthWrite scale={500} />
      <ParticleField system={sparks} blending="additive" scale={500} />
    </>
  ),
  camera: { initialDistance: 15, initialHeight: 5, minDistance: 6, maxDistance: 40, targetHeight: 2.5, maxPolarAngle: 1.45 },
};
