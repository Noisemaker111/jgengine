import type { CSSProperties, ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import type { AmbienceZoneDef } from "@jgengine/core/audio/ambience";
import type { GameContext, GameContextEntityEntry, GameContextObjectEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { useGameContext } from "@jgengine/react/provider";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { AudioProbe } from "@jgengine/shell/audio/audioProbe";
import type { PlayableGame } from "@jgengine/shell/registry";

const HERO = "hero";
const MACHINE = "machine";
const WALL = "wall";

/** A foot on each side of x=12: the camera crosses one boundary in the middle of the room. */
const ZONES: readonly AmbienceZoneDef[] = [
  {
    id: "meadow",
    sound: "bed_meadow",
    shape: { kind: "box", min: [-40, -20, -40], max: [12, 40, 40] },
    crossfade: 8,
  },
  {
    id: "shaft",
    sound: "bed_shaft",
    shape: { kind: "box", min: [12, -20, -40], max: [64, 40, 40] },
    crossfade: 8,
  },
];

const hum = {
  id: "machine_hum",
  bus: "sfx",
  loop: true,
  positional: true,
  falloff: { minDistance: 2, maxDistance: 40, curve: "inverse" as const },
  synth: {
    voices: [
      { kind: "tone" as const, freq: 55, duration: 2, gain: 0.5, wave: "sawtooth" as const, sustain: 2, attack: 0.01 },
      { kind: "noise" as const, duration: 2, filterFreq: 700, filterType: "bandpass" as const, gain: 0.3, sustain: 2 },
    ],
  },
};

const impact = {
  id: "impact",
  bus: "sfx",
  synth: {
    voices: [
      { kind: "noise" as const, duration: 0.6, filterFreq: 240, gain: 0.9, decay: 0.5 },
      { kind: "tone" as const, freq: 70, duration: 0.5, gain: 0.5, slideTo: 40 },
    ],
  },
  duck: { buses: ["ambient"], amount: 0.85, seconds: 1.2 },
};

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 120, d: 120 }, height: 2, frequency: 0.02, seed: "ambience" }),
  vegetation: grass({ area: { w: 110, d: 110 }, density: 2, colors: ["#223f19", "#7fa04a"], seed: "ambience" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [HERO]: { movement: { walkSpeed: 6 }, role: "player" },
  [MACHINE]: { role: "npc" },
};

const wallCollider = {
  name: "body",
  purpose: "physical" as const,
  shape: { kind: "aabb" as const, halfExtents: [3, 8, 0.4] as const, offset: [0, 8, 0] as const },
  blocks: true,
};

const objectCatalog: Record<string, GameContextObjectEntry> = {
  [WALL]: { halfExtents: [3, 8, 0.4], colliders: { body: wallCollider } },
};

const game = defineGameDefinition({
  name: "ambience",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onInit(ctx: GameContext): void {
  for (const x of [-6, 0, 6]) ctx.scene.object.place(WALL, x, 0, 8);
  ctx.scene.entity.spawn(MACHINE, { id: MACHINE, position: [0, 0, 16] });
}

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(HERO, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

function goTo(ctx: GameContext, position: readonly [number, number, number]): void {
  ctx.scene.entity.setPose(ctx.player.userId, { position: [position[0], position[1], position[2]] });
}

const button: CSSProperties = {
  pointerEvents: "auto",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.3)",
  background: "rgba(17,22,30,0.85)",
  color: "#e2e8f0",
  fontSize: 13,
  fontWeight: 600,
  padding: "9px 12px",
  cursor: "pointer",
};

function AmbienceUI(): ReactNode {
  const ctx = useGameContext();
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div className="pointer-events-auto absolute bottom-4 left-4 flex max-w-[680px] flex-wrap gap-2 rounded-xl border border-white/10 bg-neutral-950/80 p-3">
        <button type="button" style={button} onClick={() => goTo(ctx, [0, 0, 0])}>
          Meadow
        </button>
        <button type="button" style={button} onClick={() => goTo(ctx, [24, 0, 0])}>
          Shaft
        </button>
        <button type="button" style={button} onClick={() => goTo(ctx, [0, 0, 30])}>
          Past the wall
        </button>
        <button type="button" style={button} onClick={() => goTo(ctx, [0, 0, 0])}>
          Behind the wall
        </button>
        <button type="button" style={button} onClick={() => ctx.game.audio.play("impact")}>
          Impact (duck ambience)
        </button>
      </div>
    </div>
  );
}

/** Capture probe: measured mix, zone mix and occlusion cost as plain numbers a headless drive can print. */
function probe(ctx: GameContext): Record<string, number> {
  void ctx;
  const audio = typeof window === "undefined"
    ? undefined
    : (window as unknown as { __jgengineAudio?: AudioProbe }).__jgengineAudio;
  if (audio === undefined) return { audioReady: 0 };
  const level = audio.measure();
  const ambience = audio.ambience();
  const occlusion = audio.occlusion();
  const out: Record<string, number> = {
    audioReady: 1,
    rms: level.rms,
    peak: level.peak,
    occlusionTests: occlusion.tests,
    occlusionBlocked: occlusion.blocked,
    occlusionPerTestMs: occlusion.perTestMs,
    ambientBus: audio.busLevel("ambient"),
    sceneObjects: ctx.scene.object.list().length,
  };
  const last = occlusion.lastTest;
  if (last !== null) {
    out.lastFromY = last.from.y;
    out.lastFromZ = last.from.z;
    out.lastToY = last.to.y;
    out.lastToZ = last.to.z;
    out.lastBlocked = last.blocked ? 1 : 0;
  }
  for (const entry of ambience.levels) out[`zone_${entry.id}`] = entry.level;
  return out;
}

/** Probe for the audio depth layer: zone beds crossfaded by listener position, geometry occlusion and cue ducking. */
export const ambienceDemoGame: PlayableGame = {
  game,
  content: {
    entityById: (catalogId) => entityCatalog[catalogId] ?? null,
    objectById: (catalogId) => objectCatalog[catalogId] ?? null,
  },
  loop: { onInit, onNewPlayer, onTick: () => undefined, onReset: () => undefined, onDispose: () => undefined },
  GameUI: AmbienceUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 22, initialHeight: 16, minDistance: 10, maxDistance: 60, targetHeight: 0, maxPolarAngle: 1.3 },
  audio: {
    sounds: {
      bed_meadow: {
        id: "bed_meadow",
        bus: "ambient",
        positional: false,
        loop: true,
        synth: {
          voices: [
            { kind: "tone", freq: 130, duration: 4, gain: 0.16, wave: "triangle", sustain: 4, attack: 0.005 },
            { kind: "tone", freq: 170, duration: 4, gain: 0.08, wave: "sine", sustain: 4, attack: 0.005 },
          ],
        },
      },
      bed_shaft: {
        id: "bed_shaft",
        bus: "ambient",
        positional: false,
        loop: true,
        synth: {
          voices: [
            { kind: "tone", freq: 60, duration: 4, gain: 0.2, wave: "sine", sustain: 4, attack: 0.005 },
            { kind: "tone", freq: 90, duration: 4, gain: 0.1, wave: "triangle", sustain: 4, attack: 0.005 },
          ],
        },
      },
      machine_hum: hum,
      impact,
    },
    buses: { ambient: { id: "ambient", gain: 0.6 }, sfx: { id: "sfx", gain: 0.6 } },
    zones: ZONES,
    occlusion: { maxTestsPerTick: 4, intervalMs: 120 },
  },
  entitySounds: { [MACHINE]: "machine_hum" },
  capture: { probe },
};
