import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Quaternion, Vector3 } from "three";
import { useGameContext } from "@jgengine/react/provider";
import type { AudioEngine } from "./audioEngine.view";
import { installAudioProbe } from "./audioProbe.view";
import { createEmitterTracker, type EmitterPose, type EmitterSources, type EmitterTracker } from "./emitterTracking.view";
import { groundFocusListener, type ListenerAnchor } from "./listenerAnchor";
import { createListenerVelocityTrack, stepListenerVelocity, type ListenerVelocityTrack } from "./loopParams";
import { sceneLineBlocked } from "./occlusionRaycast";
import { enclosurePreset, type EnclosureSample } from "@jgengine/core/audio/reverb";
import { devtools } from "@jgengine/core/devtools/devtools";
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

export function AudioListener({ engine, anchor = "camera" }: { engine: AudioEngine; anchor?: ListenerAnchor }) {
  const camera = useThree((state) => state.camera);
  const ctx = useGameContext();
  const trackRef = useRef<ListenerVelocityTrack>(createListenerVelocityTrack());
  const scratchRef = useRef({ direction: new Vector3(), up: new Vector3(), quaternion: new Quaternion() });
  const enclosureClock = useRef(ENCLOSURE_INTERVAL_S);
  const lastEnclosure = useRef<EnclosureSample | null>(null);
  useEffect(
    () =>
      devtools.probes.registerSystem("audio/enclosure", {
        counters: () => {
          const sample = lastEnclosure.current;
          return { ceilingM: sample?.ceiling ?? -1, wallHits: sample?.walls.filter((wall) => wall !== null).length ?? 0 };
        },
        state: () => `${engine.spatialStats().reverb} · ceiling ${lastEnclosure.current?.ceiling?.toFixed(1) ?? "open"} · walls ${lastEnclosure.current?.walls.map((wall) => (wall === null ? "-" : wall.toFixed(0))).join(" ") ?? "?"}`,
      }),
    [engine],
  );
  useEffect(() => {
    engine.setOcclusionSource((from, to) => sceneLineBlocked(ctx.scene, from, to));
    return () => engine.setOcclusionSource(null);
  }, [engine, ctx]);
  useEffect(() => installAudioProbe(engine), [engine]);
  useFrame((_, dt) => {
    const { direction, up, quaternion } = scratchRef.current;
    camera.getWorldDirection(direction);
    up.copy(camera.up).applyQuaternion(camera.getWorldQuaternion(quaternion));
    const eye = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    const position = anchor === "ground" ? groundFocusListener(eye, direction, ctx.world.groundHeightAt(eye.x, eye.z)) : eye;
    engine.setListenerPose({
      position,
      forward: { x: direction.x, y: direction.y, z: direction.z },
      up: { x: up.x, y: up.y, z: up.z },
      velocity: stepListenerVelocity(trackRef.current, position, dt),
    });
    enclosureClock.current += dt;
    if (enclosureClock.current < ENCLOSURE_INTERVAL_S) return;
    enclosureClock.current = 0;
    const sample = sampleEnclosure(ctx.scene, hearingPoint(ctx, position));
    lastEnclosure.current = sample;
    engine.setReverbEnvironment(enclosurePreset(sample));
  });
  return null;
}

/**
 * Keep one loop per sounding entity/object. The tracker retains the loops and only reads the
 * emitters it already plays, so a still world stops paying a per-frame rebuild (#2209).
 */
function useTrackedEmitters(
  engine: AudioEngine,
  soundByKey: Record<string, string> | undefined,
  sources: EmitterSources,
) {
  const soundsRef = useRef(soundByKey);
  soundsRef.current = soundByKey;
  const stateRef = useRef<{ engine: AudioEngine; tracker: EmitterTracker } | null>(null);
  const current = stateRef.current;
  if (current === null || current.engine !== engine) {
    // `sources` closes over the session's game context, which outlives the engine it was built with.
    current?.tracker.dispose();
    stateRef.current = {
      engine,
      tracker: createEmitterTracker({
        sources,
        sounds: () => soundsRef.current,
        play: (soundId, position) => engine.playLoop(soundId, position),
      }),
    };
  }

  useEffect(
    () => () => {
      stateRef.current?.tracker.dispose();
      stateRef.current = null;
    },
    [engine],
  );

  useFrame(() => stateRef.current?.tracker.step());
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
  const sourcesRef = useRef<EmitterSources | null>(null);
  sourcesRef.current ??= entitySources(ctx);
  useTrackedEmitters(engine, entitySounds, sourcesRef.current);
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
  const sourcesRef = useRef<EmitterSources | null>(null);
  sourcesRef.current ??= objectSources(ctx);
  useTrackedEmitters(engine, objectSounds, sourcesRef.current);
  return null;
}
