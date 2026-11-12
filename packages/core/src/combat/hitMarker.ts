import type { DamageAppliedEvent, GameEvents } from "../game/events";
import type { GameContext } from "../runtime/gameContextTypes";

/** Whether `source` is the local player or what they currently drive. */
export function isLocalSource(ctx: Pick<GameContext, "player">, source: string | undefined): boolean {
  if (source === undefined) return false;
  return source === ctx.player.userId || source === ctx.player.possession.active(ctx.player.userId);
}

/**
 * A confirmed hit, as a shooter's hit marker shows it: a plain hit, a critical hit, or a kill.
 * Ranked: a kill outranks a crit, which outranks a hit.
 */
export type HitMarkerKind = "hit" | "crit" | "kill";

const RANK: Readonly<Record<HitMarkerKind, number>> = { hit: 0, crit: 1, kill: 2 };

/**
 * The marker a `combat.damage` announcement earns, or `null` for none. Only a direct blow the local
 * player (or what they drive) dealt to something else counts: status ticks, zero or negative amounts,
 * blows from anyone else and the player hurting themself are not confirmed hits. A lethal blow is a
 * `kill`; a blow announced with `crit: true` is a `crit`.
 *
 * @capability hit-marker-kind decide whether a damage event earns a hit, crit or kill marker for the local player
 */
export function hitMarkerKindOf(
  event: Pick<DamageAppliedEvent, "target" | "source" | "amount" | "lethal" | "status" | "crit">,
  isMine: (instanceId: string) => boolean,
): HitMarkerKind | null {
  if (event.status !== undefined || !(event.amount > 0)) return null;
  if (event.source === undefined || !isMine(event.source)) return null;
  if (isMine(event.target)) return null;
  if (event.lethal) return "kill";
  return event.crit === true ? "crit" : "hit";
}

/** How a marker moves: every number a game tunes. Times are milliseconds on the caller's clock. */
export interface HitMarkerTiming {
  /** How long each kind of marker stays up, pop and fade included. */
  lifeMs: Readonly<Record<HitMarkerKind, number>>;
  /** Milliseconds the marker takes to settle from `popScale` to 1. Default 0 (no pop). */
  popMs?: number;
  /** Scale the marker appears at before it settles. Default 1. */
  popScale?: number;
  /** Milliseconds at the end of its life over which the marker fades out. Default 0 (cuts out). */
  fadeMs?: number;
  /**
   * Hits within this many milliseconds of the marker's start are one volley (a shotgun's pellets,
   * one blast's targets): they raise the marker to the strongest kind and count up instead of
   * restarting it. Default 0, so every hit restarts the marker.
   */
  volleyMs?: number;
}

/** The marker on screen right now. */
export interface HitMarkerFrame {
  kind: HitMarkerKind;
  /** Blows folded into this marker (pellets of one volley). */
  count: number;
  /** Milliseconds since the marker started. */
  ageMs: number;
  /** 0..1 strength: 1 until the fade starts. */
  opacity: number;
  /** `popScale` settling to 1 over `popMs`. */
  scale: number;
  /** Where the latest blow landed, when the announcement said. */
  position?: readonly [number, number, number];
}

export interface HitMarkers {
  /** Show a marker for `kind` at `nowMs`, folding it into a live volley. */
  push(kind: HitMarkerKind, nowMs: number, position?: readonly [number, number, number]): void;
  /** Feed one damage announcement through {@link hitMarkerKindOf}; returns the kind it showed, if any. */
  observe(event: DamageAppliedEvent, nowMs: number): HitMarkerKind | null;
  /** Subscribe to `combat.damage` on a bus; returns the unsubscribe. */
  listen(events: Pick<GameEvents, "on">, now: () => number): () => void;
  /** The marker at `nowMs`, or `null` once it has run its life. */
  frame(nowMs: number): HitMarkerFrame | null;
  /** Markers shown since creation, by kind (a volley counts once). */
  stats(): Readonly<Record<HitMarkerKind, number>>;
  clear(): void;
}

interface Live {
  kind: HitMarkerKind;
  count: number;
  startMs: number;
  position: readonly [number, number, number] | undefined;
}

/**
 * The hit-marker cue as data: which damage announcements are confirmed hits, the strongest kind a
 * volley reached, and the marker's pop, hold and fade over time. The view draws the frame; this holds
 * no rendering, so the rules are testable without a screen.
 *
 * @capability hit-markers hit, crit and kill markers from damage events, with volley folding, pop and fade
 */
export function createHitMarkers(timing: HitMarkerTiming, isMine: (instanceId: string) => boolean): HitMarkers {
  const popMs = Math.max(0, timing.popMs ?? 0);
  const popScale = timing.popScale ?? 1;
  const fadeMs = Math.max(0, timing.fadeMs ?? 0);
  const volleyMs = Math.max(0, timing.volleyMs ?? 0);
  let live: Live | null = null;
  const counts: Record<HitMarkerKind, number> = { hit: 0, crit: 0, kill: 0 };

  const lifeOf = (kind: HitMarkerKind) => Math.max(0, timing.lifeMs[kind]);

  const markers: HitMarkers = {
    push(kind, nowMs, position) {
      const current = live;
      if (current !== null && nowMs >= current.startMs && nowMs - current.startMs <= volleyMs && nowMs - current.startMs < lifeOf(current.kind)) {
        current.count += 1;
        if (position !== undefined) current.position = position;
        if (RANK[kind] > RANK[current.kind]) {
          counts[kind] += 1;
          current.kind = kind;
        }
        return;
      }
      counts[kind] += 1;
      live = { kind, count: 1, startMs: nowMs, position };
    },
    observe(event, nowMs) {
      const kind = hitMarkerKindOf(event, isMine);
      if (kind !== null) markers.push(kind, nowMs, event.position);
      return kind;
    },
    listen(events, now) {
      return events.on("combat.damage", (event) => {
        markers.observe(event, now());
      });
    },
    frame(nowMs) {
      const current = live;
      if (current === null) return null;
      const ageMs = nowMs - current.startMs;
      const life = lifeOf(current.kind);
      if (ageMs < 0 || ageMs >= life) return null;
      const left = life - ageMs;
      const fade = Math.min(fadeMs, life);
      const opacity = fade > 0 && left < fade ? left / fade : 1;
      const scale = popMs > 0 && ageMs < popMs ? popScale + (1 - popScale) * (ageMs / popMs) : 1;
      return {
        kind: current.kind,
        count: current.count,
        ageMs,
        opacity,
        scale,
        ...(current.position === undefined ? {} : { position: current.position }),
      };
    },
    stats() {
      return { ...counts };
    },
    clear() {
      live = null;
    },
  };
  return markers;
}
