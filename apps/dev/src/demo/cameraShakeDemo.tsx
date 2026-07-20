import { useEffect, type CSSProperties, type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createCameraShake } from "@jgengine/core/vfx/cameraShake";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { CameraShakeMeter } from "@jgengine/react/cameraShake";

import { ControllerCameraShake } from "@jgengine/shell/camera";
import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const HERO = "hero";

// One shared controller: the HUD buttons feed it impacts, the shell consumer
// applies its offset to the camera, and the meter reads its trauma. A fixed seed
// keeps the shake deterministic; bigger maxRotation makes the tilt read in a still.
// `decayPerSecond: 0` holds the opening impulse so the demo shakes continuously
// (the noise time cursor still advances each frame, so it genuinely oscillates) —
// a game would use the default decay (~1.6) and add trauma on real impacts.
const shake = createCameraShake({
  seed: "camera-shake-demo",
  decayPerSecond: 0,
  maxTranslation: [0.8, 0.8, 0.5],
  maxRotation: [0.14, 0.14, 0.24],
  frequency: 12,
});

// Human labels per game-owned kind — the model never interprets these strings.
const kindLabels: Record<string, string> = {
  hit: "Hit",
  explosion: "Explosion",
  landing: "Landing",
};

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 2, frequency: 0.03, seed: "shake" }),
  vegetation: grass({ area: { w: 52, d: 52 }, density: 3, colors: ["#26401a", "#7fb04a"], seed: "shake" }),
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
  return (
    <>
      <EnvironmentScene feature={terrainFeature} />
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[2.4, 2.4, 2.4]} />
        <meshStandardMaterial color="#f97316" metalness={0.2} roughness={0.5} />
      </mesh>
      <mesh position={[-4, 0.9, -2]} castShadow>
        <boxGeometry args={[1.8, 1.8, 1.8]} />
        <meshStandardMaterial color="#38bdf8" metalness={0.2} roughness={0.5} />
      </mesh>
      <mesh position={[4.2, 1.5, -1]} castShadow>
        <boxGeometry args={[1.4, 3, 1.4]} />
        <meshStandardMaterial color="#a855f7" metalness={0.2} roughness={0.5} />
      </mesh>
      <mesh position={[2, 0.7, 4]} castShadow>
        <sphereGeometry args={[1.1, 24, 24]} />
        <meshStandardMaterial color="#4ade80" metalness={0.2} roughness={0.4} />
      </mesh>
      <ControllerCameraShake controller={shake} />
    </>
  );
}

export const cameraShakeDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: CameraShakeUI,
  environment: () => <ShakeStage />,
  camera: { initialDistance: 12, initialHeight: 6, minDistance: 6, maxDistance: 30, targetHeight: 1, maxPolarAngle: 1.3 },
};
