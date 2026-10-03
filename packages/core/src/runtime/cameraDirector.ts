import type { CameraRigKind, ChaseCameraConfig, ChaseView, CinematicCameraConfig, GameCameraConfig } from "../game/playableGame";
import type { GameContext } from "./gameContext";

/** Data overlay for an existing rig; callbacks and Canvas projection/preferences remain configured by the game. */
export type CameraRigConfig = Omit<GameCameraConfig, "rig" | "projection" | "pixelPerfect" | "frustum" | "playerFov" | "weapon" | "onCameraFollow">;

/** Runtime rig selection and detached data overlay over the configured camera. */
export interface CameraRigOverride {
  kind: CameraRigKind;
  config: CameraRigConfig;
}

/** Camera policy state before the JSON-safe snapshot number encoding. */
export interface CameraDirectorState {
  followEntityId?: string | null;
  rig: CameraRigOverride | null;
  cinematic: CinematicCameraConfig | null;
  chase: ChaseCameraTuning | null;
}

type CameraSerialized<T> = T extends number ? number | { $cameraNumber: "Infinity" } :
  T extends object ? { [Key in keyof T]: CameraSerialized<T[Key]> } : T;
/** JSON-safe camera policy; documented instant chase responses use an explicit Infinity marker. */
export type CameraDirectorSnapshot = CameraSerialized<CameraDirectorState>;

const RIG_KINDS: readonly CameraRigKind[] = ["orbit", "first", "topDown", "rts", "shoulder", "lockOn", "chase", "observer", "turntable", "sideScroll", "inspection", "none"];
type Check = (value: unknown) => boolean;
const number: Check = (value) => typeof value === "number" && Number.isFinite(value);
const response: Check = (value) => number(value) || value === Number.POSITIVE_INFINITY;
const boolean: Check = (value) => typeof value === "boolean";
const string: Check = (value) => typeof value === "string";
const oneOf = (...values: readonly string[]): Check => (value) => typeof value === "string" && values.includes(value);
const shape = (fields: Record<string, Check>, required: readonly string[] = []): Check => (value) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  const row = value as Record<string, unknown>;
  return required.every((key) => row[key] !== undefined) && Object.entries(row).every(([key, field]) =>
    Object.hasOwn(fields, key) && (field === undefined || fields[key]!(field)));
};
function numbers<const Keys extends readonly string[]>(...keys: Keys): Record<Keys[number], Check> {
  return Object.fromEntries(keys.map((key) => [key, number])) as Record<Keys[number], Check>;
}
const point = shape(numbers("x", "y", "z"));
const target3d = shape(numbers("x", "y", "z"), ["x", "y", "z"]);
const topDownFields = {
  ...numbers("height", "pitch", "yaw", "followSmoothing"), targetOffset: point,
  zoom: shape(numbers("min", "max", "speed")),
};
const chaseFields = (allowInfinity: boolean) => ({
  ...numbers("distance", "height", "lookHeight", "springDamping", "shakePerSpeed"),
  headingSource: oneOf("body", "input"), view: oneOf("chase", "cockpit", "hood", "rear"),
  yawResponse: allowInfinity ? response : number,
  fov: shape({ ...numbers("base", "max", "speedForMax"), response: allowInfinity ? response : number }),
  distanceBySpeed: shape(numbers("extra", "speedForMax"), ["extra"]),
  pitchFollow: shape(numbers("blend", "max", "response")), fovKick: shape(numbers("decay", "max")),
  lookBackAction: string,
  collision: (value: unknown) => boolean(value) || shape(numbers("radius", "minDistance"))(value),
  lead: shape(numbers("time", "max"), ["time"]), bank: shape(numbers("perYawRate", "max", "damping"), ["perYawRate"]),
  velocityYaw: shape(numbers("blend", "minSpeed", "response")),
});
const cinematic = shape({
  loop: boolean,
  keyframes: (value) => Array.isArray(value) && value.every(shape({
    position: target3d, lookAt: target3d, ...numbers("fov", "duration"), ease: oneOf("linear", "smooth"),
  }, ["position", "lookAt"])),
}, ["keyframes"]);
const rigConfig = shape({
  ...numbers("transitionSeconds", "minDistance", "maxDistance", "targetHeight", "initialDistance", "initialHeight", "initialYaw", "initialPitch", "rotateSpeed", "zoomSpeed", "dampingFactor", "targetSmoothing", "dragTargetSmoothing", "distanceSmoothing", "minPolarAngle", "maxPolarAngle"),
  perspective: oneOf("third", "first"), targetOffset: point, followLock: boolean, followEnabled: boolean,
  followEntityId: (value) => value === null || string(value),
  pitchClamp: (value) => Array.isArray(value) && value.length === 2 && value.every(number),
  collision: shape({ enabled: boolean, ...numbers("padding", "minTargetDistance") }),
  firstPerson: shape({ ...numbers("eyeHeight", "sensitivity", "maxPitch"), reticle: boolean, viewmodel: boolean }),
  topDown: shape(topDownFields),
  rts: shape({ ...topDownFields, ...numbers("panSpeed", "rotateSpeed"), pan: boolean,
    edgeScroll: (value) => boolean(value) || shape(numbers("margin", "speed"))(value),
    bounds: shape(numbers("minX", "maxX", "minZ", "maxZ")), start: shape(numbers("x", "z")),
  }),
  shoulder: shape({ ...numbers("shoulderOffset", "heightOffset", "distance", "adsTransitionSpeed", "sensitivity", "fov"),
    side: oneOf("left", "right"), ads: shape(numbers("distance", "shoulderOffset", "fov", "heightOffset")), reticleOffset: shape(numbers("x", "y")),
  }),
  lockOn: shape({ ...numbers("distance", "height", "lookHeight", "framingBias", "yawSmoothing"), targetEntityId: string }),
  chase: shape({ ...chaseFields(true), seatOffsets: shape({ cockpit: point, hood: point, rear: point }) }),
  observer: shape({ ...numbers("distance", "height", "lookHeight", "orbitSpeed", "startAngle", "fov"),
    bind: (value) => shape({ kind: oneOf("entity"), entityId: string }, ["kind", "entityId"])(value) ||
      shape({ kind: oneOf("point"), position: target3d }, ["kind", "position"])(value),
  }),
  turntable: shape({ ...numbers("distance", "height", "lookHeight", "orbitSpeed", "startAngle", "fov"), target: target3d }),
  sideScroll: shape({ ...numbers("distance", "height", "lookHeight", "followSmoothing", "fov"), axis: oneOf("x", "z") }),
  inspection: shape({ ...numbers("initialDistance", "minDistance", "maxDistance", "minPolarAngle", "maxPolarAngle", "rotateSpeed", "zoomSpeed", "dampingFactor"),
    anchor: oneOf("target", "cursor", "center"), target: point, initialPosition: point, pan: boolean,
  }),
  shake: shape(numbers("maxOffset", "maxRoll", "decayPerSecond", "exponent", "frequency")), cinematic,
} satisfies Record<keyof CameraRigConfig, Check>);

/** @internal */
export function validateCameraRig(kind: CameraRigKind, config: CameraRigConfig = {}): void {
  if (!RIG_KINDS.includes(kind) || !rigConfig(config)) throw new Error("invalid camera rig override");
}

/** @internal */
export function validateChaseCameraTuning(tuning: ChaseCameraTuning | null): void {
  if (tuning !== null && !shape(chaseFields(true))(tuning)) throw new Error("invalid chase camera tuning");
}

function reviveNumbers(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw.map(reviveNumbers);
  if (raw === null || typeof raw !== "object") return raw;
  if (Object.getPrototypeOf(raw) !== Object.prototype && Object.getPrototypeOf(raw) !== null) return raw;
  if (Object.keys(raw).length === 1 && "$cameraNumber" in raw && raw.$cameraNumber === "Infinity") return Infinity;
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, reviveNumbers(value)]));
}

function decodeCameraState(raw: unknown): CameraDirectorState | null {
  try { raw = reviveNumbers(raw); } catch { return null; }
  if (raw === null || typeof raw !== "object") return null;
  const state = raw as CameraDirectorState;
  if (state.followEntityId !== undefined && state.followEntityId !== null && typeof state.followEntityId !== "string") return null;
  if (!("rig" in state) || !("cinematic" in state) || !("chase" in state)) return null;
  try {
    if (state.rig !== null) {
      if (!shape({ kind: oneOf(...RIG_KINDS), config: rigConfig }, ["kind", "config"])(state.rig)) return null;
    }
    if (state.cinematic !== null && !cinematic(state.cinematic)) return null;
    if (state.chase !== null && !shape(chaseFields(true))(state.chase)) return null;
    return structuredClone(state);
  } catch { return null; }
}

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
    | "headingSource"
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
  /** Replace the runtime rig overlay; `null` restores the game's configured rig/config. Existing chase tuning remains independent. */
  setRig(kind: CameraRigKind | null, config?: CameraRigConfig): void;
  rig(): CameraRigOverride | null;
  setCinematic(config: CinematicCameraConfig | null): void;
  cinematic(): CinematicCameraConfig | null;
  /** Overlay a runtime patch on the chase rig's config — a boss-intro pull-back, drift zoom-out; `null` restores the static config. */
  setChaseTuning(tuning: ChaseCameraTuning | null): void;
  chaseTuning(): ChaseCameraTuning | null;
  /** Add a transient FOV impulse in degrees (a landing, a hit, a boost) that the chase rig layers on and decays per `camera.chase.fovKick`. Kicks from one frame sum. */
  kickFov(degrees: number): void;
  /** Drain the FOV impulses queued since the last call; the shell's chase rig calls this once per frame. */
  takeFovKick(): number;
  snapshot(): CameraDirectorSnapshot;
  /** Invalid state throws before changing any camera field. */
  restore(state: CameraDirectorSnapshot): void;
  /** Clear runtime policy and transient FOV kicks; configured camera data remains untouched. */
  reset(): void;
  subscribe(listener: () => void): () => void;
}

/** @internal */
export function createCameraDirector(): CameraDirector {
  const listeners = new Set<() => void>();
  let followEntity: string | null | undefined = undefined;
  let cinematicConfig: CinematicCameraConfig | null = null;
  let chaseTuningPatch: ChaseCameraTuning | null = null;
  let rigOverride: CameraRigOverride | null = null;
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
    setRig(kind, config = {}) {
      if (kind !== null) validateCameraRig(kind, config);
      rigOverride = kind === null ? null : { kind, config: structuredClone(config) };
      notify();
    },
    rig: () => rigOverride,
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
    snapshot: () => JSON.parse(JSON.stringify({ ...(followEntity === undefined ? {} : { followEntityId: followEntity }), rig: rigOverride, cinematic: cinematicConfig, chase: chaseTuningPatch }, (_key, value) => {
      if (value === Infinity) return { $cameraNumber: "Infinity" };
      if (typeof value === "number" && !Number.isFinite(value)) throw new Error("invalid camera number");
      return value;
    })),
    restore(state) {
      const decoded = decodeCameraState(state);
      if (decoded === null) throw new Error("invalid camera director state");
      followEntity = decoded.followEntityId;
      rigOverride = decoded.rig;
      cinematicConfig = decoded.cinematic;
      chaseTuningPatch = decoded.chase;
      pendingFovKick = 0;
      notify();
    },
    reset() {
      followEntity = undefined;
      rigOverride = null;
      cinematicConfig = null;
      chaseTuningPatch = null;
      pendingFovKick = 0;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Local camera policy is saved, never broadcast to another player's presentation. @internal */
export function installCameraPersistence(ctx: GameContext): void {
  ctx.game.registerSave?.({
    key: "camera",
    snapshot: ctx.camera.snapshot,
    hydrate: ctx.camera.restore,
    decode: decodeCameraState,
  });
}
