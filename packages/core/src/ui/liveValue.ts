const LIVE = Symbol.for("jgengine.live");

/** A value read fresh every frame instead of passed once: make one with {@link live}. */
export interface LiveValue<T> {
  readonly [LIVE]: true;
  get(): T;
}

export type Live<T> = T | LiveValue<T>;

/**
 * A value an engine UI part reads every frame and draws into its own node, never through a UI
 * render: `<KitMeter value={live(() => fuel(ctx))} max={100} />`. The getter may close over props; the
 * part always calls the newest one.
 *
 * @capability live-prop hand an engine UI part a value that moves every frame (a meter, a distance, a countdown) so only its own node updates
 */
export function live<T>(get: () => T): LiveValue<T> {
  return { [LIVE]: true, get };
}

export function isLive(value: unknown): value is LiveValue<unknown> {
  return typeof value === "object" && value !== null && Reflect.get(value, LIVE) === true;
}

export function readLive<T>(value: Live<T>): T {
  return isLiveOf(value) ? value.get() : value;
}

function isLiveOf<T>(value: Live<T>): value is LiveValue<T> {
  return isLive(value);
}
