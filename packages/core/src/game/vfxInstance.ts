import type { RetainedVfxKind, VfxRef } from "./events";

/**
 * The serializable specification for creating (or replacing) a retained VFX instance. Unlike a one-shot
 * `combat.vfx` burst this describes a long-lived effect whose endpoints and parameters are updated over
 * time. `id` is caller-stable so repeated `upsert` calls address the same effect; omit it to mint one.
 * `from`/`to` are {@link VfxRef}s (an entity instance id or a world point) that a renderer resolves each
 * frame, so an endpoint bound to a moving entity follows it without any per-frame command traffic.
 */
export interface VfxInstanceSpec {
  /** Caller-stable handle. Repeated `upsert` with the same id replaces the instance; omitted mints a fresh id. */
  id?: string;
  /** Open effect archetype (e.g. `"beam"`). Renderers register kinds, so new visuals need no central branch. */
  kind: RetainedVfxKind;
  /** `0xRRGGBB` tint. */
  color: number;
  /** Origin endpoint: an entity instance id (followed live) or a fixed world point. */
  from?: VfxRef;
  /** Target endpoint: an entity instance id (followed live) or a fixed world point. */
  to?: VfxRef;
  /** Effect radius/thickness in world units, interpreted per kind. */
  radius?: number;
  /** Extra numeric knobs a renderer reads by name (intensity, spin, width, ...), kept a flat serializable bag. */
  params?: Readonly<Record<string, number>>;
  /** Optional time-to-live in ms: the instance auto-stops if `tick` runs past `ttlMs` since its last touch (heartbeat). */
  ttlMs?: number;
}

/**
 * The stored, fully-resolved form of a retained VFX instance. It is a plain serializable record so hosts can
 * replicate it and debug tooling can inspect it; renderers receive it verbatim and never merge partial state
 * themselves. `updatedAtMs` is the last create/update time and drives TTL heartbeat eviction.
 */
export interface VfxInstanceState {
  /** Stable instance id. */
  readonly id: string;
  /** Effect archetype. */
  readonly kind: RetainedVfxKind;
  /** `0xRRGGBB` tint. */
  readonly color: number;
  /** Origin endpoint, if any. */
  readonly from?: VfxRef;
  /** Target endpoint, if any. */
  readonly to?: VfxRef;
  /** Effect radius/thickness. */
  readonly radius?: number;
  /** Renderer knobs. */
  readonly params?: Readonly<Record<string, number>>;
  /** TTL in ms, if the instance heartbeats. */
  readonly ttlMs?: number;
  /** Clock time (ms) of the last create/update; the TTL heartbeat measures staleness from here. */
  readonly updatedAtMs: number;
}

/**
 * A partial update to a live retained VFX instance. Only the provided fields change; `params` is shallow-merged
 * so a caller can nudge one knob without resending the whole bag. Setting a field to `undefined` clears it.
 * Applying a patch refreshes the instance heartbeat.
 */
export interface VfxInstancePatch {
  /** New tint. */
  color?: number;
  /** New origin endpoint. */
  from?: VfxRef;
  /** New target endpoint. */
  to?: VfxRef;
  /** New radius/thickness. */
  radius?: number;
  /** Knobs shallow-merged into the current `params`. */
  params?: Readonly<Record<string, number>>;
}

/** Options for {@link VfxInstanceStore.stop}. */
export interface VfxInstanceStopOptions {
  /** Fade-out duration in ms handed to the renderer; `0` (default) disposes immediately. */
  fadeMs?: number;
}

/**
 * The lifecycle op a {@link VfxInstanceStore} emits to its renderer sink. `upsert`/`update` carry the full merged
 * {@link VfxInstanceState} (the renderer applies it directly, no merge); `stop` carries the id plus a fade duration.
 * This is the payload of the `combat.vfxInstance` game event when the store is wired to the event bus.
 */
export interface CombatVfxInstanceEvent {
  /** `upsert` creates/replaces, `update` mutates dynamic params, `stop` disposes (with optional fade). */
  readonly op: "upsert" | "update" | "stop";
  /** The affected instance id. */
  readonly id: string;
  /** The full merged state, present for `upsert` and `update`. */
  readonly instance?: VfxInstanceState;
  /** Fade-out duration in ms, present for `stop`. */
  readonly fadeMs?: number;
}

/**
 * A headless registry of retained VFX instances: create/replace, partially update, and stop long-lived effects
 * addressed by stable id, independent of any renderer. It owns the authoritative serializable state and exposes
 * inspection counts; wire {@link VfxInstanceStoreOptions.onOp} to a renderer (via the `combat.vfxInstance` event)
 * to drive visuals.
 */
export interface VfxInstanceStore {
  /**
   * Create the instance, or replace it in place when its id already exists (idempotent by id). Returns the id
   * (minted when the spec omits one). Refreshes the heartbeat.
   */
  upsert(spec: VfxInstanceSpec): string;
  /**
   * Merge `patch` into the live instance and refresh its heartbeat. Returns `false` for an unknown id (a missing
   * update is a no-op, never a throw), `true` otherwise.
   */
  update(id: string, patch: VfxInstancePatch): boolean;
  /** Dispose the instance, emitting a `stop` op with the resolved fade. Returns `false` for an unknown id. */
  stop(id: string, options?: VfxInstanceStopOptions): boolean;
  /** The current state of `id`, or `null` if absent. */
  get(id: string): VfxInstanceState | null;
  /** Every live instance, insertion-ordered. */
  list(): readonly VfxInstanceState[];
  /** Live instance count, for debug/inspection HUDs. */
  count(): number;
  /** Auto-stop instances whose TTL has elapsed as of `nowMs` (defaults to the store clock). Returns the number stopped. */
  tick(nowMs?: number): number;
  /** Dispose every instance (scene change / reset), emitting a `stop` op for each. */
  clear(): void;
}

/** Options for {@link createVfxInstanceStore}. */
export interface VfxInstanceStoreOptions {
  /** Sink for lifecycle ops; wire to `events.emit("combat.vfxInstance", op)` so the shell renders them. */
  onOp?: (op: CombatVfxInstanceEvent) => void;
  /** Injected clock (ms) for heartbeat timestamps and TTL; defaults to `Date.now`. Pass a sim clock for determinism. */
  now?: () => number;
  /** Prefix for minted instance ids. Defaults to `"vfx"`. */
  idPrefix?: string;
}

function cloneParams(
  params: Readonly<Record<string, number>> | undefined,
): Readonly<Record<string, number>> | undefined {
  return params === undefined ? undefined : { ...params };
}

/**
 * Build a headless retained-VFX registry. The store is the serializable source of truth for long-lived effects
 * (beams, tethers, zones, target lines, looping emitters) that must move and mutate without one-shot re-emit
 * flicker: `upsert` creates or replaces by stable id, `update` nudges dynamic params, `stop` disposes with an
 * optional fade, and `tick` enforces TTL heartbeats. It stays independent of renderer availability, so simulation
 * and tests run without a shell; a wired `onOp` sink turns each op into a `combat.vfxInstance` event the shell
 * binds to render resources.
 *
 * @capability retained-vfx create/update/stop long-lived dynamic visual effects (beam, tether, zone, target line) by stable id
 */
export function createVfxInstanceStore(options: VfxInstanceStoreOptions = {}): VfxInstanceStore {
  const onOp = options.onOp;
  const now = options.now ?? (() => Date.now());
  const idPrefix = options.idPrefix ?? "vfx";
  const instances = new Map<string, VfxInstanceState>();
  let seq = 0;

  function emit(op: CombatVfxInstanceEvent): void {
    onOp?.(op);
  }

  function upsert(spec: VfxInstanceSpec): string {
    const id = spec.id ?? `${idPrefix}-${seq++}`;
    const state: VfxInstanceState = {
      id,
      kind: spec.kind,
      color: spec.color,
      ...(spec.from === undefined ? {} : { from: spec.from }),
      ...(spec.to === undefined ? {} : { to: spec.to }),
      ...(spec.radius === undefined ? {} : { radius: spec.radius }),
      ...(spec.params === undefined ? {} : { params: cloneParams(spec.params) }),
      ...(spec.ttlMs === undefined ? {} : { ttlMs: spec.ttlMs }),
      updatedAtMs: now(),
    };
    instances.set(id, state);
    emit({ op: "upsert", id, instance: state });
    return id;
  }

  function update(id: string, patch: VfxInstancePatch): boolean {
    const current = instances.get(id);
    if (current === undefined) return false;
    const mergedParams =
      patch.params === undefined ? current.params : { ...(current.params ?? {}), ...patch.params };
    const nextFrom = "from" in patch ? patch.from : current.from;
    const nextTo = "to" in patch ? patch.to : current.to;
    const nextRadius = "radius" in patch ? patch.radius : current.radius;
    const next: VfxInstanceState = {
      id: current.id,
      kind: current.kind,
      color: patch.color ?? current.color,
      ...(nextFrom === undefined ? {} : { from: nextFrom }),
      ...(nextTo === undefined ? {} : { to: nextTo }),
      ...(nextRadius === undefined ? {} : { radius: nextRadius }),
      ...(mergedParams === undefined ? {} : { params: cloneParams(mergedParams) }),
      ...(current.ttlMs === undefined ? {} : { ttlMs: current.ttlMs }),
      updatedAtMs: now(),
    };
    instances.set(id, next);
    emit({ op: "update", id, instance: next });
    return true;
  }

  function stop(id: string, stopOptions: VfxInstanceStopOptions = {}): boolean {
    if (!instances.has(id)) return false;
    instances.delete(id);
    emit({ op: "stop", id, fadeMs: stopOptions.fadeMs ?? 0 });
    return true;
  }

  function get(id: string): VfxInstanceState | null {
    return instances.get(id) ?? null;
  }

  function list(): readonly VfxInstanceState[] {
    return [...instances.values()];
  }

  function count(): number {
    return instances.size;
  }

  function tick(nowMs: number = now()): number {
    let stopped = 0;
    for (const state of [...instances.values()]) {
      if (state.ttlMs === undefined) continue;
      if (nowMs - state.updatedAtMs >= state.ttlMs) {
        if (stop(state.id)) stopped += 1;
      }
    }
    return stopped;
  }

  function clear(): void {
    for (const id of [...instances.keys()]) stop(id);
  }

  return { upsert, update, stop, get, list, count, tick, clear };
}
