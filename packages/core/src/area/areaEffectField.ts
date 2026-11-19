// @skill jgengine-world
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

export type AreaShape =
  | { readonly kind: "sphere"; readonly center: EntityPosition; readonly radius: number }
  | {
      readonly kind: "custom";
      readonly center: EntityPosition;
      readonly radius: number;
      readonly contains: (point: EntityPosition) => boolean;
    };

export interface AreaSourceSpec<P> {
  readonly id: string;
  readonly shape: AreaShape;
  readonly payload: P;
  /** Milliseconds between `refresh` edges emitted for each member; omit for enter/leave only. */
  readonly refreshMs?: number;
  /** Aggregation group key for stacking policies; defaults to the source id. */
  readonly stackKey?: string;
  readonly enabled?: boolean;
}

/** Why a `leave` edge fired. */
export type AreaLeaveReason = "exit" | "source-removed" | "disabled" | "cleared";

export type AreaEventKind = "enter" | "refresh" | "leave";

export interface AreaEffectEvent<P> {
  readonly kind: AreaEventKind;
  readonly sourceId: string;
  readonly receiverId: string;
  readonly stackKey: string;
  readonly payload: P;
  readonly ticks?: number;
  readonly reason?: AreaLeaveReason;
}

export interface AreaMembership<P> {
  readonly sourceId: string;
  readonly receiverId: string;
  readonly stackKey: string;
  readonly payload: P;
}

export interface AreaStepInput {
  /** Milliseconds since the previous step; negative values are clamped to 0. */
  readonly dtMs: number;
  /** Bounded broad-phase: receiver ids possibly inside `shape` (e.g. `spatialIndex.querySphere`). */
  readonly candidates: (shape: AreaShape) => Iterable<string>;
  readonly positionOf: (receiverId: string) => EntityPosition | undefined;
  readonly eligible?: (sourceId: string, receiverId: string, payload: unknown) => boolean;
}

export interface AreaFieldState<P> {
  readonly sources: {
    readonly id: string;
    readonly payload: P;
    readonly refreshMs?: number | undefined;
    readonly stackKey: string;
    readonly enabled: boolean;
  }[];
  readonly memberships: {
    readonly sourceId: string;
    readonly receiverId: string;
    readonly sinceRefreshMs: number;
  }[];
}

export interface AreaEffectField<P> {
  setSource(spec: AreaSourceSpec<P>): void;
  removeSource(id: string): AreaEffectEvent<P>[];
  hasSource(id: string): boolean;
  sourceIds(): string[];
  step(input: AreaStepInput): AreaEffectEvent<P>[];
  members(sourceId: string): string[];
  isMember(sourceId: string, receiverId: string): boolean;
  memberships(): AreaMembership<P>[];
  membershipsOf(receiverId: string): AreaMembership<P>[];
  clear(): AreaEffectEvent<P>[];
  serialize(): AreaFieldState<P>;
  /**
   * Replace sources and membership with a {@link serialize} result — the save/load counterpart.
   * Sources come back on a sentinel shape, so re-`setSource` live shapes before the next `step`.
   * Members the restored state does not carry leave with reason `"cleared"`; survivors keep their
   * refresh phase without an enter/leave churn.
   */
  restore(state: AreaFieldState<P>): AreaEffectEvent<P>[];
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

  function applyState(next: AreaFieldState<P>): void {
    sources.clear();
    for (const source of next.sources) {
      sources.set(source.id, {
        shape: SENTINEL_SHAPE,
        payload: source.payload,
        refreshMs: source.refreshMs,
        stackKey: source.stackKey,
        enabled: source.enabled,
        members: new Map(),
      });
    }
    for (const membership of next.memberships) {
      sources.get(membership.sourceId)?.members.set(membership.receiverId, {
        sinceRefreshMs: membership.sinceRefreshMs,
      });
    }
  }

  if (state !== undefined) applyState(state);

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
    restore(next) {
      const kept = new Set(next.memberships.map((membership) => `${membership.sourceId}\u0000${membership.receiverId}`));
      const events: AreaEffectEvent<P>[] = [];
      for (const [sourceId, rec] of sources) {
        for (const receiverId of [...rec.members.keys()]) {
          if (kept.has(`${sourceId}\u0000${receiverId}`)) continue;
          rec.members.delete(receiverId);
          events.push({ kind: "leave", sourceId, receiverId, stackKey: rec.stackKey, payload: rec.payload, reason: "cleared" });
        }
      }
      applyState(next);
      return events;
    },
  };
}

// Measurement line batch1.
