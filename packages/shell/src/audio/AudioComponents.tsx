import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { useSceneEntities, useSceneObjects } from "@jgengine/react/hooks";
import type { AudioEmitterHandle, AudioEngine } from "./audioEngine";

export function AudioListener({ engine }: { engine: AudioEngine }) {
  const camera = useThree((state) => state.camera);
  useFrame(() => {
    engine.setListenerPose({ x: camera.position.x, y: camera.position.y, z: camera.position.z });
  });
  return null;
}

function useTrackedEmitters(
  engine: AudioEngine,
  soundByKey: Record<string, string> | undefined,
  entries: readonly { id: string; key: string; position: readonly [number, number, number] }[],
) {
  const handles = useRef(new Map<string, AudioEmitterHandle>());

  useEffect(
    () => () => {
      for (const handle of handles.current.values()) handle.stop();
      handles.current.clear();
    },
    [engine],
  );

  useFrame(() => {
    if (soundByKey === undefined) return;
    const live = new Set<string>();
    for (const entry of entries) {
      const soundId = soundByKey[entry.key];
      if (soundId === undefined) continue;
      live.add(entry.id);
      let handle = handles.current.get(entry.id);
      if (handle === undefined) {
        handle = engine.playLoop(soundId, { x: entry.position[0], y: entry.position[1], z: entry.position[2] }) ?? undefined;
        if (handle !== undefined) handles.current.set(entry.id, handle);
        continue;
      }
      handle.setPosition({ x: entry.position[0], y: entry.position[1], z: entry.position[2] });
    }
    for (const [id, handle] of handles.current) {
      if (!live.has(id)) {
        handle.stop();
        handles.current.delete(id);
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
  const entities = useSceneEntities();
  useTrackedEmitters(
    engine,
    entitySounds,
    entities.map((entity) => ({ id: entity.id, key: entity.name, position: entity.position })),
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
  const objects = useSceneObjects();
  useTrackedEmitters(
    engine,
    objectSounds,
    objects.map((object) => ({ id: object.instanceId, key: object.catalogId, position: object.position })),
  );
  return null;
}
