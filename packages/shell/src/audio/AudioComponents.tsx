import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { useGameContext } from "@jgengine/react/provider";
import type { AudioEmitterHandle, AudioEngine } from "./audioEngine";

export function AudioListener({ engine }: { engine: AudioEngine }) {
  const camera = useThree((state) => state.camera);
  useFrame(() => {
    engine.setListenerPose({ x: camera.position.x, y: camera.position.y, z: camera.position.z });
  });
  return null;
}

type EmitterEntry = { id: string; key: string; position: readonly [number, number, number] };

function useTrackedEmitters(
  engine: AudioEngine,
  soundByKey: Record<string, string> | undefined,
  readEntries: () => readonly EmitterEntry[],
) {
  const handles = useRef(new Map<string, AudioEmitterHandle>());
  const lastPose = useRef(new Map<string, readonly [number, number, number]>());

  useEffect(
    () => () => {
      for (const handle of handles.current.values()) handle.stop();
      handles.current.clear();
      lastPose.current.clear();
    },
    [engine],
  );

  useFrame(() => {
    if (soundByKey === undefined) return;
    const live = new Set<string>();
    for (const entry of readEntries()) {
      const soundId = soundByKey[entry.key];
      if (soundId === undefined) continue;
      live.add(entry.id);
      let handle = handles.current.get(entry.id);
      if (handle === undefined) {
        handle = engine.playLoop(soundId, { x: entry.position[0], y: entry.position[1], z: entry.position[2] }) ?? undefined;
        if (handle !== undefined) {
          handles.current.set(entry.id, handle);
          lastPose.current.set(entry.id, entry.position);
        }
        continue;
      }
      const prev = lastPose.current.get(entry.id);
      if (
        prev !== undefined &&
        prev[0] === entry.position[0] &&
        prev[1] === entry.position[1] &&
        prev[2] === entry.position[2]
      ) {
        continue;
      }
      handle.setPosition({ x: entry.position[0], y: entry.position[1], z: entry.position[2] });
      lastPose.current.set(entry.id, entry.position);
    }
    for (const [id, handle] of handles.current) {
      if (!live.has(id)) {
        handle.stop();
        handles.current.delete(id);
        lastPose.current.delete(id);
      }
    }
  });
}

export function EntityAudioEmitters({
  engine,
  entitySounds,
}: {
  engine: AudioEngine;
  entitySounds: Record<string, string> | undefined;
}) {
  const ctx = useGameContext();
  useTrackedEmitters(engine, entitySounds, () =>
    ctx.scene.entity.list().map((entity) => ({ id: entity.id, key: entity.name, position: entity.position })),
  );
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
  useTrackedEmitters(engine, objectSounds, () =>
    ctx.scene.object.list().map((object) => ({
      id: object.instanceId,
      key: object.catalogId,
      position: object.position,
    })),
  );
  return null;
}
