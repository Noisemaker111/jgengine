import type { ChaseCameraConfig, CinematicCameraConfig } from "../game/playableGame";

/** Runtime patch over the static `camera.chase` config — distance/height/fov retuning from gameplay events (#286.11). */
export type ChaseCameraTuning = Partial<
  Pick<ChaseCameraConfig, "distance" | "height" | "lookHeight" | "springDamping" | "fov" | "lead" | "bank">
>;

export interface CameraDirector {
  follow(entityId: string | null): void;
  /** `undefined` means no runtime override — the shell falls back to the static `playable.camera.followEntityId`. `null` means explicitly follow nothing. */
  followedEntityId(): string | null | undefined;
  setCinematic(config: CinematicCameraConfig | null): void;
  cinematic(): CinematicCameraConfig | null;
  /** Overlay a runtime patch on the chase rig's config — a boss-intro pull-back, drift zoom-out; `null` restores the static config. */
  setChaseTuning(tuning: ChaseCameraTuning | null): void;
  chaseTuning(): ChaseCameraTuning | null;
  subscribe(listener: () => void): () => void;
}

export function createCameraDirector(): CameraDirector {
  const listeners = new Set<() => void>();
  let followEntity: string | null | undefined = undefined;
  let cinematicConfig: CinematicCameraConfig | null = null;
  let chaseTuningPatch: ChaseCameraTuning | null = null;

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
    setChaseTuning(tuning) {
      chaseTuningPatch = tuning;
      notify();
    },
    chaseTuning: () => chaseTuningPatch,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
