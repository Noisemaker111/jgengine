import { useEffect, useMemo, type CSSProperties, type ReactNode } from "@jgengine/core/ui/jsx";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry } from "three";
import { disposeObjectTree, SceneObjectAttach } from "@jgengine/core/frame/useEngineDraw.draw";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { CameraShakeMeter } from "@jgengine/core/camera/shake/cameraShake.view";

import { defaultCameraShake } from "@jgengine/core/camera/shake/cameraShake";
import { EnvironmentScene } from "@jgengine/core/environment/EnvironmentScene.draw";
import type { PlayableGame } from "@jgengine/shell/registry";

const HERO = "hero";

// The shell's one shake controller: the HUD buttons feed it impacts, the camera rig
// applies its offset, and the meter reads its trauma. `decayPerSecond: 0` (in the
// camera config below) holds the opening impulse so the demo shakes continuously —
// a game would keep the default decay (~1.6) and add trauma on real impacts.
const shake = defaultCameraShake;

// Human labels per game-owned kind — the model never interprets these strings.
const kindLabels: Record<string, string> = {
  hit: "Hit",
  explosion: "Explosion",
  landing: "Landing",
};

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 2, frequency: 0.03, seed: "shake" }),
  vegetation: grass({ area: { w: 52, d: 52 }, colour: { baseColor: "#26401a", tipColor: "#7fb04a" }, seed: "shake" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [HERO]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "camera-shake",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

// Fire one impulse when the HUD mounts so the capture frame lands on a non-zero
// trauma meter and a visibly displaced/tilted camera.
let openingFired = false;

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(HERO, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

const hudButton: CSSProperties = {
  pointerEvents: "auto",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.3)",
  background: "rgba(17,22,30,0.85)",
  color: "#e2e8f0",
  fontSize: 13,
  fontWeight: 600,
  padding: "10px 14px",
  cursor: "pointer",
};

function CameraShakeUI(): ReactNode {
  useEffect(() => {
    if (openingFired) return;
    openingFired = true;
    shake.add(0.9, "explosion");
  }, []);
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div style={{ position: "absolute", top: 20, left: 20 }}>
        <CameraShakeMeter controller={shake} kindLabels={kindLabels} />
      </div>
      <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 12 }}>
        <button type="button" style={hudButton} onClick={() => shake.add(0.35, "hit")}>
          💥 Hit
        </button>
        <button type="button" style={hudButton} onClick={() => shake.add(0.8, "explosion")}>
          🔥 Explosion
        </button>
        <button type="button" style={hudButton} onClick={() => shake.add(0.5, "landing")}>
          🛬 Landing
        </button>
      </div>
    </div>
  );
}

// A cluster of lit blocks so the shake reads: their straight edges tilt with the
// camera roll and slide with the positional kick.
function ShakeStage(): ReactNode {
  const blocks = useMemo(() => {
    const root = new Group();
    const add = (geometry: import("three").BufferGeometry, color: string, position: readonly [number, number, number], roughness: number) => {
      const block = new Mesh(geometry, new MeshStandardMaterial({ color, metalness: 0.2, roughness }));
      block.position.set(position[0], position[1], position[2]);
      block.castShadow = true;
      root.add(block);
    };
    add(new BoxGeometry(2.4, 2.4, 2.4), "#f97316", [0, 1.2, 0], 0.5);
    add(new BoxGeometry(1.8, 1.8, 1.8), "#38bdf8", [-4, 0.9, -2], 0.5);
    add(new BoxGeometry(1.4, 3, 1.4), "#a855f7", [4.2, 1.5, -1], 0.5);
    add(new SphereGeometry(1.1, 24, 24), "#4ade80", [2, 0.7, 4], 0.4);
    return root;
  }, []);
  useEffect(() => () => disposeObjectTree(blocks), [blocks]);
  return (
    <>
      <EnvironmentScene feature={terrainFeature} />
      <SceneObjectAttach object={blocks} />
    </>
  );
}

export const cameraShakeDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: CameraShakeUI,
  scene: { environment: () => <ShakeStage /> },
  camera: {
    orbit: {
      initialDistance: 12,
      initialHeight: 6,
      minDistance: 6,
      maxDistance: 30,
      targetHeight: 1,
      maxPolarAngle: 1.3,
    },
    shake: { maxOffset: 0.8, maxRoll: 0.24, decayPerSecond: 0, frequency: 12 },
  },
};
