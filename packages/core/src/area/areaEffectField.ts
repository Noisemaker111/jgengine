/**
 * Continuous area-effect membership: moving sources emit an area that follows them each tick,
 * receivers that move in and out get enter / refresh / leave edges, and membership is cleaned up
 * when a source is removed, disabled, or the field is cleared. A pure lifecycle machine — it never
 * applies damage, heals, or stat changes itself; the caller routes each edge through its own
 * effect pipeline (see `combat/effects`, `combat/dotField`, `stats/statModifiers`). This is the
 * dynamic, source-following counterpart to `scene/authoredTriggers` (static document volumes).
 *
 * Bounded by design: the caller supplies a broad-phase `candidates(shape)` query (e.g.
 * `visibility/spatialIndex`'s `querySphere`) plus a `positionOf` lookup, so a step visits only
 * receivers near each source — never the whole world. Serializable: `serialize()` captures the
 * membership set and each member's refresh phase so cadence and enter/leave edges survive save/load.
 */

import type { EntityPosition } from "../scene/entityStore";

/**
 * The area a source occupies this tick. `sphere` is first-class; `custom` leaves a seam for authored
 * volumes and other shapes while still exposing a bounding sphere (`center`/`radius`) for the caller's
 * broad-phase candidate query.
 */
export type AreaShape =
  | { readonly kind: "sphere"; readonly center: EntityPosition; readonly radius: number }
  | {
      readonly kind: "custom";
      /** Bounding-sphere center the caller's broad-phase `candidates` query is built from. */
      readonly center: EntityPosition;
      /** Bounding-sphere radius the caller's broad-phase `candidates` query is built from. */
      readonly radius: number;
      /** Authoritative containment test applied to each broad-phase candidate. */
      readonly contains: (point: EntityPosition) => boolean;
    };

/** Descriptor for one continuous area source; re-supplied each tick so its shape follows the emitter. */
export interface AreaSourceSpec<P> {
  /** Stable source id (the emitter). Re-using an id updates the descriptor and preserves membership. */
  readonly id: string;
  /** The source's area this tick — pass the emitter's live position so membership follows it. */
  readonly shape: AreaShape;
  /** Caller data describing what this source does (damage amount, heal, buff key, capture rate…). */
  readonly payload: P;
  /** Milliseconds between `refresh` edges emitted for each member; omit for enter/leave only. */
  readonly refreshMs?: number;
  /** Aggregation group key for stacking policies; defaults to the source id. */
  readonly stackKey?: string;
  /** When false the source keeps its descriptor but holds no members (current members `leave`). Default true. */
  readonly enabled?: boolean;
}

/** Why a `leave` edge fired. */
export type AreaLeaveReason = "exit" | "source-removed" | "disabled" | "cleared";

/** The three membership edges a step can emit. */
export type AreaEventKind = "enter" | "refresh" | "leave";

/** One membership edge emitted by `step`, `removeSource`, or `clear`. */
export interface AreaEffectEvent<P> {
  readonly kind: AreaEventKind;
  readonly sourceId: string;
  readonly receiverId: string;
  readonly stackKey: string;
  readonly payload: P;
  /** Number of refresh cadences crossed this step (>= 1 on `refresh`; a large dt can cross several). */
  readonly ticks?: number;
  /** Present only on `leave`. */
  readonly reason?: AreaLeaveReason;
}

/** One active (source, receiver) membership — feed a receiver's list to a stacking policy. */
export interface AreaMembership<P> {
  readonly sourceId: string;
  readonly receiverId: string;
  readonly stackKey: string;
  readonly payload: P;
}

/** Per-tick inputs the field needs to reconcile membership without scanning the world. */
export interface AreaStepInput {
  /** Milliseconds since the previous step; negative values are clamped to 0. */
  readonly dtMs: number;
  /** Bounded broad-phase: receiver ids possibly inside `shape` (e.g. `spatialIndex.querySphere`). */
  readonly candidates: (shape: AreaShape) => Iterable<string>;
  /** Precise receiver position; `undefined` means the receiver is gone (removed/dead) and is dropped. */
  readonly positionOf: (receiverId: string) => EntityPosition | undefined;
  /** Optional per-pair gate (team filter, immunity, line-of-sight already resolved by the caller). */
  readonly eligible?: (sourceId: string, receiverId: string, payload: unknown) => boolean;
}

/** Serialized field state: source descriptors (minus their transient shape) and per-member refresh phase. */
export interface AreaFieldState<P> {
  readonly sources: {
    readonly id: string;
    readonly payload: P;
    readonly refreshMs?: number;
    readonly stackKey: string;
    readonly enabled: boolean;
  }[];
  readonly memberships: {
    readonly sourceId: string;
    readonly receiverId: string;
    readonly sinceRefreshMs: number;
  }[];
}

/** Runtime handle tracking continuous area membership across ticks. */
export interface AreaEffectField<P> {
  /** Register or update a source (upsert by id); an update preserves existing membership and refresh phase. */
  setSource(spec: AreaSourceSpec<P>): void;
  /** Remove a source and return a `leave` (reason `source-removed`) for each of its members. */
  removeSource(id: string): AreaEffectEvent<P>[];
  hasSource(id: string): boolean;
  sourceIds(): string[];
  /** Reconcile every source against the receivers its `candidates` query returns; emit enter/refresh/leave. */
  step(input: AreaStepInput): AreaEffectEvent<P>[];
  /** Receiver ids currently inside `sourceId`. */
  members(sourceId: string): string[];
  isMember(sourceId: string, receiverId: string): boolean;
  /** Every active membership across all sources. */
  memberships(): AreaMembership<P>[];
  /** Active memberships affecting a single receiver — the input to a stacking policy. */
  membershipsOf(receiverId: string): AreaMembership<P>[];
  /** Drop all sources and members; returns a `leave` (reason `cleared`) for each member. */
  clear(): AreaEffectEvent<P>[];
  /** Snapshot the persistent membership lifecycle for save/load; shapes are transient and re-supplied via `setSource`. */
  serialize(): AreaFieldState<P>;
}

interface MemberRecord {
  sinceRefreshMs: number;
}

interface SourceRecord<P> {
  shape: AreaShape;
  payload: P;
  refreshMs: number | undefined;
  stackKey: string;
  enabled: boolean;
  members: Map<string, MemberRecord>;
}

const SENTINEL_SHAPE: AreaShape = { kind: "sphere", center: [0, 0, 0], radius: 0 };

function shapeContains(shape: AreaShape, point: EntityPosition): boolean {
  if (shape.kind === "custom") return shape.contains(point);
  const dx = point[0] - shape.center[0];
  const dy = point[1] - shape.center[1];
  const dz = point[2] - shape.center[2];
  return dx * dx + dy * dy + dz * dz <= shape.radius * shape.radius;
}

/**
 * Build a continuous area-effect field. Drive it with `setSource` (once per live source per tick, so
 * shapes follow their emitters) and `step` (to reconcile membership and drain enter/refresh/leave edges).
 * Optionally restore prior membership by passing a `serialize()` snapshot; re-`setSource` live shapes
 * before the first `step` after restore, since shapes are transient.
 *
 * @capability area-effect-field source-following area membership with enter/refresh/leave edges, stacking, and cleanup
 */
export function createAreaEffectField<P = unknown>(state?: AreaFieldState<P>): AreaEffectField<P> {
  const sources = new Map<string, SourceRecord<P>>();

  if (state !== undefined) {
    for (const source of state.sources) {
      sources.set(source.id, {
        shape: SENTINEL_SHAPE,
        payload: source.payload,
        refreshMs: source.refreshMs,
        stackKey: source.stackKey,
        enabled: source.enabled,
        members: new Map(),
      });
    }
    for (const membership of state.memberships) {
      sources.get(membership.sourceId)?.members.set(membership.receiverId, {
        sinceRefreshMs: membership.sinceRefreshMs,
      });
    }
  }

  function leaveAll(rec: SourceRecord<P>, sourceId: string, reason: AreaLeaveReason): AreaEffectEvent<P>[] {
    const events: AreaEffectEvent<P>[] = [];
    for (const receiverId of rec.members.keys()) {
      events.push({ kind: "leave", sourceId, receiverId, stackKey: rec.stackKey, payload: rec.payload, reason });
    }
    rec.members.clear();
    return events;
  }

  return {
    setSource(spec) {
      const stackKey = spec.stackKey ?? spec.id;
      const enabled = spec.enabled ?? true;
      const existing = sources.get(spec.id);
      if (existing !== undefined) {
        existing.shape = spec.shape;
        existing.payload = spec.payload;
        existing.refreshMs = spec.refreshMs;
        existing.stackKey = stackKey;
        existing.enabled = enabled;
        return;
      }
      sources.set(spec.id, {
        shape: spec.shape,
        payload: spec.payload,
        refreshMs: spec.refreshMs,
        stackKey,
        enabled,
        members: new Map(),
      });
    },
    removeSource(id) {
      const rec = sources.get(id);
      if (rec === undefined) return [];
      const events = leaveAll(rec, id, "source-removed");
      sources.delete(id);
      return events;
    },
    hasSource: (id) => sources.has(id),
    sourceIds: () => [...sources.keys()],
    step(input) {
      const dtMs = Math.max(0, input.dtMs);
      const events: AreaEffectEvent<P>[] = [];
      for (const [sourceId, rec] of sources) {
        if (!rec.enabled) {
          events.push(...leaveAll(rec, sourceId, "disabled"));
          continue;
        }
        const seen = new Set<string>();
        for (const receiverId of input.candidates(rec.shape)) {
          if (seen.has(receiverId)) continue;
          const position = input.positionOf(receiverId);
          if (position === undefined) continue;
          if (!shapeContains(rec.shape, position)) continue;
          if (input.eligible !== undefined && !input.eligible(sourceId, receiverId, rec.payload)) continue;
          seen.add(receiverId);
          const member = rec.members.get(receiverId);
          if (member === undefined) {
            rec.members.set(receiverId, { sinceRefreshMs: 0 });
            events.push({ kind: "enter", sourceId, receiverId, stackKey: rec.stackKey, payload: rec.payload });
            continue;
          }
          if (rec.refreshMs !== undefined && rec.refreshMs > 0) {
            member.sinceRefreshMs += dtMs;
            let ticks = 0;
            while (member.sinceRefreshMs >= rec.refreshMs) {
              member.sinceRefreshMs -= rec.refreshMs;
              ticks += 1;
            }
            if (ticks > 0) {
              events.push({ kind: "refresh", sourceId, receiverId, stackKey: rec.stackKey, payload: rec.payload, ticks });
            }
          }
        }
        for (const receiverId of [...rec.members.keys()]) {
          if (seen.has(receiverId)) continue;
          rec.members.delete(receiverId);
          events.push({ kind: "leave", sourceId, receiverId, stackKey: rec.stackKey, payload: rec.payload, reason: "exit" });
        }
      }
      return events;
    },
    members: (sourceId) => [...(sources.get(sourceId)?.members.keys() ?? [])],
    isMember: (sourceId, receiverId) => sources.get(sourceId)?.members.has(receiverId) ?? false,
    memberships() {
      const out: AreaMembership<P>[] = [];
      for (const [sourceId, rec] of sources) {
        for (const receiverId of rec.members.keys()) {
          out.push({ sourceId, receiverId, stackKey: rec.stackKey, payload: rec.payload });
        }
      }
      return out;
    },
    membershipsOf(receiverId) {
      const out: AreaMembership<P>[] = [];
      for (const [sourceId, rec] of sources) {
        if (rec.members.has(receiverId)) {
          out.push({ sourceId, receiverId, stackKey: rec.stackKey, payload: rec.payload });
        }
      }
      return out;
    },
    clear() {
      const events: AreaEffectEvent<P>[] = [];
      for (const [sourceId, rec] of sources) events.push(...leaveAll(rec, sourceId, "cleared"));
      sources.clear();
      return events;
    },
    serialize() {
      const out: AreaFieldState<P> = { sources: [], memberships: [] };
      for (const [id, rec] of sources) {
        out.sources.push({ id, payload: rec.payload, refreshMs: rec.refreshMs, stackKey: rec.stackKey, enabled: rec.enabled });
        for (const [receiverId, member] of rec.members) {
          out.memberships.push({ sourceId: id, receiverId, sinceRefreshMs: member.sinceRefreshMs });
        }
      }
      return out;
    },
  };
}
