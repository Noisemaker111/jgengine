import type { ChaseCameraConfig, ChaseView, CinematicCameraConfig } from "../game/playableGame";

/** Runtime patch over the static `camera.chase` config — distance/height/fov retuning from gameplay events (#286.11), a whole driving-feel overlay applied only while a vehicle is piloted (#1299), or a `view` switch between chase and seat cameras. */
export type ChaseCameraTuning = Partial<
  Pick<
    ChaseCameraConfig,
    | "distance"
    | "height"
    | "lookHeight"
    | "springDamping"
    | "fov"
    | "lead"
    | "bank"
    | "shakePerSpeed"
    | "velocityYaw"
    | "yawResponse"
    | "distanceBySpeed"
    | "pitchFollow"
    | "fovKick"
    | "lookBackAction"
    | "collision"
    | "view"
  >
>;

/** Default order {@link nextChaseView} cycles through. */
export const CHASE_VIEWS: readonly ChaseView[] = ["chase", "hood", "cockpit"];

/**
 * The view after `current` in `views`, wrapping at the end; a view missing from the list starts the cycle over.
 * Pair with `setChaseTuning` to bind a "change camera" key:
 * `ctx.camera.setChaseTuning({ ...ctx.camera.chaseTuning(), view: nextChaseView(view) })`.
 *
 * @capability chase-view-cycle cycle a vehicle camera between chase, hood and cockpit views at runtime
 */
export function nextChaseView(current: ChaseView, views: readonly ChaseView[] = CHASE_VIEWS): ChaseView {
  if (views.length === 0) return current;
  const index = views.indexOf(current);
  return views[(index + 1) % views.length]!;
}

export interface CameraDirector {
  follow(entityId: string | null): void;
  /** `undefined` means no runtime override — the shell falls back to the static `playable.camera.followEntityId`. `null` means explicitly follow nothing. */
  followedEntityId(): string | null | undefined;
  setCinematic(config: CinematicCameraConfig | null): void;
  cinematic(): CinematicCameraConfig | null;
  /** Overlay a runtime patch on the chase rig's config — a boss-intro pull-back, drift zoom-out; `null` restores the static config. */
  setChaseTuning(tuning: ChaseCameraTuning | null): void;
  chaseTuning(): ChaseCameraTuning | null;
  /** Add a transient FOV impulse in degrees (a landing, a hit, a boost) that the chase rig layers on and decays per `camera.chase.fovKick`. Kicks from one frame sum. */
  kickFov(degrees: number): void;
  /** Drain the FOV impulses queued since the last call; the shell's chase rig calls this once per frame. */
  takeFovKick(): number;
  subscribe(listener: () => void): () => void;
}

/** @internal */
export function createCameraDirector(): CameraDirector {
  const listeners = new Set<() => void>();
  let followEntity: string | null | undefined = undefined;
  let cinematicConfig: CinematicCameraConfig | null = null;
  let chaseTuningPatch: ChaseCameraTuning | null = null;
  let pendingFovKick = 0;

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
    kickFov(degrees) {
      if (Number.isFinite(degrees)) pendingFovKick += degrees;
    },
    takeFovKick() {
      const kick = pendingFovKick;
      pendingFovKick = 0;
      return kick;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
