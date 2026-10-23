import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Quaternion, Vector3 } from "three";
import { useGameContext } from "@jgengine/react/provider";
import type { AudioEngine } from "./audioEngine";
import { createEmitterTracker, type EmitterPose, type EmitterSources, type EmitterTracker } from "./emitterTracking";
import { groundFocusListener, type ListenerAnchor } from "./listenerAnchor";
import { createListenerVelocityTrack, stepListenerVelocity, type ListenerVelocityTrack } from "./loopParams";

export function AudioListener({ engine, anchor = "camera" }: { engine: AudioEngine; anchor?: ListenerAnchor }) {
  const camera = useThree((state) => state.camera);
  const ctx = useGameContext();
  const trackRef = useRef<ListenerVelocityTrack>(createListenerVelocityTrack());
  const scratchRef = useRef({ direction: new Vector3(), up: new Vector3(), quaternion: new Quaternion() });
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
