const LIVE = Symbol.for("jgengine.live");

/** A value read fresh every frame instead of passed once: make one with {@link live}. */
export interface LiveValue<T> {
  readonly [LIVE]: true;
  get(): T;
}

/** A prop that takes either a plain value or a {@link live} one. Engine UI parts take `Live<number>` for anything that can move every frame. */
export type Live<T> = T | LiveValue<T>;

/**
 * A value an engine UI part reads every frame and draws into its own node, never through a React
 * render: `<KitMeter value={live(() => fuel(ctx))} max={100} />`. The getter may close over props; the
 * part always calls the newest one.
 *
 * @capability live-prop hand an engine UI part a value that moves every frame (a meter, a distance, a countdown) so only its own node updates
 */
export function live<T>(get: () => T): LiveValue<T> {
  return { [LIVE]: true, get };
}

/** True for a value made with {@link live}. */
export function isLive(value: unknown): value is LiveValue<unknown> {
  return typeof value === "object" && value !== null && Reflect.get(value, LIVE) === true;
}

/** The value now: a plain value as is, a {@link live} one read once. */
export function readLive<T>(value: Live<T>): T {
  return isLiveOf(value) ? value.get() : value;
}

function isLiveOf<T>(value: Live<T>): value is LiveValue<T> {
  return isLive(value);
}
