import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";

import { createRecordingBuffer, type RecordingBuffer, type RecordingBufferOptions } from "@jgengine/core/sensor/recordingBuffer";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { useGameContext } from "@jgengine/react/provider";

export interface RecordedPose {
  position: EntityPosition;
  rotationY: number;
}

/**
 * Session-recording buffer (#120) for replay / photo mode / kill-cam: records
 * an entity's pose on game-time every frame into a `RecordingBuffer`, which a
 * game can then `seek()` to scrub, drive an observer cam ghost, or export a
 * kill-cam clip. Recording rides on `ctx.time.now()`, so pause/fast-forward
 * scrub the recording exactly like the live sim.
 */
export function useSessionRecorder(entityId: string, options?: RecordingBufferOptions): RecordingBuffer<RecordedPose> {
  const ctx = useGameContext();
  const buffer = useMemo(() => createRecordingBuffer<RecordedPose>(options), []);

  useFrame(() => {
    const entity = ctx.scene.entity.get(entityId);
    if (entity === null) return;
    buffer.append(ctx.time.now(), { position: entity.position, rotationY: entity.rotationY });
  });

  return buffer;
}
