/** @jsxImportSource @jgengine/core/ui/jsx */
// @skill jgengine-world
import { useRef } from "@jgengine/core/ui/jsx";
import { Quaternion, Vector3 } from "three";
import { useGameContext } from "@jgengine/ui/provider";
import type { AudioEngine } from "./audioEngine.view";
import { installAudioProbe } from "./audioProbe.view";
import { createEmitterTracker, type EmitterPose, type EmitterSources, type EmitterTracker } from "./emitterTracking.view";
import { groundFocusListener, type ListenerAnchor } from "./listenerAnchor";
import { createListenerVelocityTrack, stepListenerVelocity, type ListenerVelocityTrack } from "./loopParams";
import { sceneLineBlocked } from "./occlusionRaycast";
import { enclosurePreset, type EnclosureSample } from "@jgengine/core/audio/reverb";
import { devtools } from "@jgengine/core/devtools/devtools";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { sampleEnclosure } from "./reverbRack.view";

/** How often the shell listens for walls and a ceiling around the player, seconds. */
const ENCLOSURE_INTERVAL_S = 0.5;

/**
 * Where the player hears the room from: their body's head (what they drive, else their own body),
 * not the chase camera floating above it; the listener itself when there is no body. @internal
 */
export function hearingPoint(
  ctx: {
    player: { userId: string; possession: { active(userId: string): string | null | undefined } };
    scene: { entity: { get(id: string): { position: readonly [number, number, number] } | null } };
  },
  fallback: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const bodyId = ctx.player.possession.active(ctx.player.userId) ?? ctx.player.userId;
  const body = ctx.scene.entity.get(bodyId);
  return body === null ? fallback : { x: body.position[0], y: body.position[1] + 1.5, z: body.position[2] };
}

/**
 * Draw-side form of {@link AudioListener}: feeds the audio engine the camera-derived listener pose,
 * velocity and half-second enclosure samples. @internal
 */
export function audioListenerDraw(
  ctx: ReturnType<typeof useGameContext>,
  engine: AudioEngine,
  anchor: ListenerAnchor,
): EngineDraw {
  const track: ListenerVelocityTrack = createListenerVelocityTrack();
  const scratch = { direction: new Vector3(), up: new Vector3(), quaternion: new Quaternion() };
  let enclosureClock = ENCLOSURE_INTERVAL_S;
  let lastEnclosure: EnclosureSample | null = null;
  let offProbe: (() => void) | null = null;
  let offAudioProbe: (() => void) | null = null;

  return {
    mount() {
      offProbe = devtools.probes.registerSystem("audio/enclosure", {
        counters: () => {
          const sample = lastEnclosure;
          return { ceilingM: sample?.ceiling ?? -1, wallHits: sample?.walls.filter((wall) => wall !== null).length ?? 0 };
        },
        state: () => `${engine.spatialStats().reverb} · ceiling ${lastEnclosure?.ceiling?.toFixed(1) ?? "open"} · walls ${lastEnclosure?.walls.map((wall) => (wall === null ? "-" : wall.toFixed(0))).join(" ") ?? "?"}`,
      });
      engine.setOcclusionSource((from, to) => sceneLineBlocked(ctx.scene, from, to));
      offAudioProbe = installAudioProbe(engine);
    },
    frame(state: EngineFrameState) {
      const camera = state.camera;
      const { direction, up, quaternion } = scratch;
      camera.getWorldDirection(direction);
      up.copy(camera.up).applyQuaternion(camera.getWorldQuaternion(quaternion));
      const eye = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
      const position = anchor === "ground" ? groundFocusListener(eye, direction, ctx.world.groundHeightAt(eye.x, eye.z)) : eye;
      engine.setListenerPose({
        position,
        forward: { x: direction.x, y: direction.y, z: direction.z },
        up: { x: up.x, y: up.y, z: up.z },
        velocity: stepListenerVelocity(track, position, state.delta),
      });
      enclosureClock += state.delta;
      if (enclosureClock < ENCLOSURE_INTERVAL_S) return;
      enclosureClock = 0;
      const sample = sampleEnclosure(ctx.scene, hearingPoint(ctx, position));
      lastEnclosure = sample;
      engine.setReverbEnvironment(enclosurePreset(sample));
    },
    dispose() {
      engine.setOcclusionSource(null);
      offProbe?.();
      offAudioProbe?.();
    },
  };
}

export function AudioListener({ engine, anchor = "camera" }: { engine: AudioEngine; anchor?: ListenerAnchor }) {
  const ctx = useGameContext();
  useEngineDraw(() => audioListenerDraw(ctx, engine, anchor), [ctx, engine, anchor]);
  return null;
}

/**
 * Keep one loop per sounding entity/object. The tracker retains the loops and only reads the
 * emitters it already plays, so a still world stops paying a per-frame rebuild (#2209).
 */
function audioEmittersDraw(
  engine: AudioEngine,
  sources: EmitterSources,
  getSounds: () => Record<string, string> | undefined,
): EngineDraw {
  const tracker: EmitterTracker = createEmitterTracker({
    sources,
    sounds: () => getSounds(),
    play: (soundId, position) => engine.playLoop(soundId, position),
  });
  return {
    frame() {
      tracker.step();
    },
    dispose() {
      tracker.dispose();
    },
  };
}

function entitySources(ctx: ReturnType<typeof useGameContext>): EmitterSources {
  return {
    ids: () => ctx.scene.entity.ids(),
    read(id: string, pose: EmitterPose) {
      const entity = ctx.scene.entity.get(id);
      if (entity === null) return false;
      pose.key = entity.name;
      pose.position = entity.position;
      return true;
    },
  };
}

function objectSources(ctx: ReturnType<typeof useGameContext>): EmitterSources {
  return {
    ids: () => ctx.scene.object.ids(),
    read(id: string, pose: EmitterPose) {
      const object = ctx.scene.object.get(id);
      if (object === null) return false;
      pose.key = object.catalogId;
      pose.position = object.position;
      return true;
    },
  };
}

export function EntityAudioEmitters({
  engine,
  entitySounds,
}: {
  engine: AudioEngine;
  entitySounds: Record<string, string> | undefined;
}) {
  const ctx = useGameContext();
  const latest = useRef(entitySounds);
  latest.current = entitySounds;
  const sourcesRef = useRef<EmitterSources | null>(null);
  sourcesRef.current ??= entitySources(ctx);
  useEngineDraw(() => audioEmittersDraw(engine, sourcesRef.current!, () => latest.current), [engine, ctx]);
  return null;
}

export function ObjectAudioEmitters({
  engine,
  objectSounds,
}: {
  engine: AudioEngine;
  objectSounds: Record<string, string> | undefined;
}) {
  const ctx = useGameContext();
  const latest = useRef(objectSounds);
  latest.current = objectSounds;
  const sourcesRef = useRef<EmitterSources | null>(null);
  sourcesRef.current ??= objectSources(ctx);
  useEngineDraw(() => audioEmittersDraw(engine, sourcesRef.current!, () => latest.current), [engine, ctx]);
  return null;
}
