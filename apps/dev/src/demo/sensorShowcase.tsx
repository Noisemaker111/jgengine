import { useEffect, useState } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGameDefinition";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { HiddenStateSource } from "@jgengine/core/sensor/hiddenStateProbe";
import { localPlayerEntity, useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";

import { useSessionRecorder } from "@jgengine/shell/replay/useSessionRecorder";
import type { PlayableGame } from "@jgengine/shell/registry";
import { FrustumSensorReadout } from "@jgengine/shell/vision/FrustumSensorHud";
import { SensorReadoutMeter, useHiddenStateProbe } from "@jgengine/shell/vision/HiddenStateProbeHud";
import { RevealHighlights, RevealScreenTint } from "@jgengine/shell/vision/RevealVision";

const HERO = "hero";
const CULPRIT = "culprit";
const CLUE = "clue-mote";
const WALL = "sensor-wall";
const CULPRIT_ID = "sensor-showcase-culprit";

const TAGS_BY_CATALOG_ID: Record<string, readonly string[]> = {
  [CULPRIT]: ["culprit"],
  [CLUE]: ["clue"],
};

const HIDDEN_SOURCES: readonly HiddenStateSource[] = [
  { id: "cold-spot", position: [0, 0, -9], variables: { ghostType: "poltergeist", activity: 0.85 } },
];

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [HERO]: { movement: { walkSpeed: 2.6 } },
  [CULPRIT]: {},
  [CLUE]: {},
};

const game = defineGameDefinition({
  name: "sensor-showcase",
  assets: createAssetCatalog(),
  multiplayer: null,
  input: {
    moveForward: ["KeyW"],
    moveBack: ["KeyS"],
    moveLeft: ["KeyA"],
    moveRight: ["KeyD"],
    jump: ["Space"],
    sprint: ["ShiftLeft"],
    turnLeft: ["KeyQ"],
    turnRight: ["KeyE"],
    darkSight: ["KeyV"],
  },
});

let elapsed = 0;

function onInit(ctx: GameContext): void {
  elapsed = 0;
  ctx.game.commands.define<Record<string, never>>("darkSight", {
    apply(state) {
      const toggle = darkSightStateFor(state);
      toggle.on = !toggle.on;
      for (const listener of toggle.listeners) listener();
      return state;
    },
  });
}

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(HERO, { id: ctx.player.userId, position: [0, 0, 4], role: "player" });
  ctx.scene.entity.spawn(CULPRIT, { id: CULPRIT_ID, position: [0, 0, -9], role: "npc" });
  ctx.scene.entity.spawn(CLUE, { position: [4, 0, -6], role: "prop" });
  for (let x = -3; x <= 3; x += 1) {
    for (let y = 0; y <= 1; y += 1) {
      ctx.scene.object.place(WALL, x, y, -2);
    }
  }
}

function onTick(ctx: GameContext, dt: number): void {
  elapsed += dt;
  const culprit = ctx.scene.entity.get(CULPRIT_ID);
  if (culprit === null) return;
  const x = Math.sin(elapsed * 0.35) * 5;
  ctx.scene.entity.setPose(CULPRIT_ID, { position: [x, 0, -9], dt });
}

function tagsForEntity(entity: SceneEntity): readonly string[] {
  return TAGS_BY_CATALOG_ID[entity.name] ?? [];
}

interface DarkSightState {
  on: boolean;
  listeners: Set<() => void>;
}

const darkSightByContext = new WeakMap<GameContext, DarkSightState>();

function darkSightStateFor(ctx: GameContext): DarkSightState {
  let state = darkSightByContext.get(ctx);
  if (state === undefined) {
    state = { on: false, listeners: new Set() };
    darkSightByContext.set(ctx, state);
  }
  return state;
}

/** Dark Sight toggle shared between the WorldOverlay (3D reveal) and GameUI (screen tint + button) — both mount as separate React trees over the same GameContext. */
function useDarkSight(): [boolean, () => void] {
  const ctx = useGameContext();
  const state = darkSightStateFor(ctx);
  const [, forceRender] = useState(0);
  useEffect(() => {
    const listener = () => forceRender((count) => count + 1);
    state.listeners.add(listener);
    return () => {
      state.listeners.delete(listener);
    };
  }, [state]);
  return [state.on, () => ctx.game.commands.run("darkSight", {})];
}

function GhostTrail() {
  const buffer = useSessionRecorder(CULPRIT_ID, { maxDurationSeconds: 6 });
  const frames = buffer.frames().filter((_, index) => index % 6 === 0);
  return (
    <>
      {frames.map((frame, index) => (
        <mesh key={index} position={[frame.data.position[0], frame.data.position[1] + 0.2, frame.data.position[2]]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshBasicMaterial color="#a78bfa" transparent opacity={0.45} depthTest={false} />
        </mesh>
      ))}
    </>
  );
}

function SensorWorldOverlay() {
  const [darkSight] = useDarkSight();
  return (
    <>
      <RevealHighlights enabled={darkSight} radius={20} tags={["culprit", "clue"]} resolveTags={tagsForEntity} />
      <FrustumSensorReadout subjectIds={[CULPRIT_ID]} subjectRadius={0.6} idealDistance={7} />
      <GhostTrail />
    </>
  );
}

function SensorHud() {
  const [darkSight, toggleDarkSight] = useDarkSight();
  const playerPosition = useGameStore((ctx) => localPlayerEntity(ctx)?.position ?? ([0, 0, 0] as const));
  const reading = useHiddenStateProbe(playerPosition, HIDDEN_SOURCES, { range: 18, variableId: "activity" });
  return (
    <div className="pointer-events-none absolute inset-0 font-mono text-white">
      <RevealScreenTint enabled={darkSight} />
      <div className="absolute left-4 top-4 flex flex-col gap-2">
        <SensorReadoutMeter label="EMF reader" reading={reading} />
      </div>
      <div className="pointer-events-auto absolute right-4 top-4">
        <button
          onClick={toggleDarkSight}
          className={`rounded border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${
            darkSight
              ? "border-sky-300 bg-sky-400/20 text-sky-100"
              : "border-white/25 bg-black/60 text-white/70 hover:bg-white/10"
          }`}
        >
          Dark Sight (V)
        </button>
      </div>
      <div className="absolute bottom-4 left-4 max-w-xs text-[11px] leading-4 text-white/50">
        WASD move · Q/E turn · V toggles Dark Sight (reveals tagged entities through the wall) · EMF reader tracks
        the culprit&apos;s cold spot · bottom-right shows framing/dwell for the culprit in your camera view.
      </div>
    </div>
  );
}

export const sensorShowcaseGame: PlayableGame = {
  game,
  content: {
    entityById: (catalogId) => entityCatalog[catalogId] ?? null,
  },
  loop: { onInit, onNewPlayer, onTick, onReset: () => {}, onDispose: () => {} },
  GameUI: SensorHud,
  WorldOverlay: SensorWorldOverlay,
  camera: {
    cinematic: {
      keyframes: [{ position: { x: 0, y: 1.6, z: 3 }, lookAt: { x: 0, y: 1, z: -9 }, fov: 55 }],
    },
  },
};
