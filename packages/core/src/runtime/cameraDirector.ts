import type { CinematicCameraConfig } from "../game/playableGame";

export interface CameraDirector {
  follow(entityId: string | null): void;
  /** `undefined` means no runtime override — the shell falls back to the static `playable.camera.followEntityId`. `null` means explicitly follow nothing. */
  followedEntityId(): string | null | undefined;
  setCinematic(config: CinematicCameraConfig | null): void;
  cinematic(): CinematicCameraConfig | null;
  subscribe(listener: () => void): () => void;
}

export function createCameraDirector(): CameraDirector {
  const listeners = new Set<() => void>();
  let followEntity: string | null | undefined = undefined;
  let cinematicConfig: CinematicCameraConfig | null = null;

  function notify(): void {
    for (const listener of listeners) listener();
  }

  return {
    follow(entityId) {
      followEntity = entityId;
      notify();
    },
    followedEntityId: () => followEntity,
    setCinematic(config) {
      cinematicConfig = config;
      notify();
    },
    cinematic: () => cinematicConfig,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
