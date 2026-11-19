import { devtools } from "../devtools/devtools";
import type { Vec3 } from "../world/geometry";
import { decayMeters, initDecayMeters, type DecayMeterValues } from "../survival/decayMeter";
import type { NeedDefinition } from "./needs";
import type { RoutinePhase, RoutineTimeline } from "./routine";

export type OffScreenMode = "near" | "far";

/**
 * Where the near/far boundary is and what it costs. The radius, the cost model and the budget are
 * the game's call — a city block and a haunted-house hallway do not share a number.
 */
export interface OffScreenPolicy {
  readonly nearRadius: number;
  /** Distance past which a near resident becomes cheap state. Defaults to `nearRadius` (no band). */
  readonly farRadius?: number;
  readonly costModel?: (id: string, distance: number) => number;
  readonly nearBudget?: number;
  /** Most spawn/despawn switches one tick may perform, so a teleporting viewer cannot hitch a frame. Default 32. */
  readonly switchBudget?: number;
}

export interface NearSpawn {
  readonly id: string;
  /** Cheap-state position, so the agent appears where it already was — never at the origin. */
  readonly position: Vec3;
  readonly place: string | null;
  readonly activity: string | null;
  readonly needs: Readonly<Record<string, number>>;
  readonly goal: Vec3;
  readonly stop: number;
  readonly travelling: boolean;
}

export interface NearHandoff {
  readonly position: Vec3;
  readonly needs: Readonly<Record<string, number>>;
}

export interface NearAgents {
  spawn(next: NearSpawn): void;
  despawn(id: string): NearHandoff | null;
  position(id: string): Vec3 | null;
  needs?(id: string): Readonly<Record<string, number>> | null;
  setGoal(id: string, goal: Vec3): void;
  /** Advance every near resident by `dt` seconds. */
  tick(dt: number, now: number): void;
  decisions?(): number;
  dispose?(): void;
}

export interface OffScreenResidentSpec {
  readonly id: string;
  /** Where the resident stands when its routine says nothing; also the fallback for a missing place. */
  readonly home: Vec3;
  readonly routine?: RoutineTimeline;
  readonly needs?: Readonly<Record<string, number>>;
  readonly pinned?: boolean;
}

export interface OffScreenAgentView {
  readonly id: string;
  readonly mode: OffScreenMode;
  readonly position: Vec3;
  readonly place: string | null;
  readonly activity: string | null;
  readonly stop: number;
  readonly travelling: boolean;
  readonly needs: Readonly<Record<string, number>>;
  readonly pinned: boolean;
  readonly distance: number;
}

export interface OffScreenStats {
  agents: number;
  near: number;
  far: number;
  promotions: number;
  demotions: number;
  farRefreshes: number;
  decisions: number;
}

export interface OffScreenSnapshot {
  policy: {
    nearRadius: number;
    farRadius: number;
    nearBudget: number | null;
    switchBudget: number;
  };
  residents: {
    id: string;
    home: Vec3;
    mode: OffScreenMode;
    position: Vec3;
    place: string | null;
    activity: string | null;
    stop: number;
    travelling: boolean;
    pinned: boolean;
    updatedAt: number;
    /** Next cheap-state refresh; `null` for a resident that never goes stale (no routine). */
    staleAt: number | null;
    needs: Record<string, number>;
  }[];
}

export interface OffScreenPolicyPatch {
  readonly nearRadius?: number;
  readonly farRadius?: number;
  readonly costModel?: (id: string, distance: number) => number;
  readonly nearBudget?: number;
  readonly switchBudget?: number;
}

export interface OffScreenOptions {
  /** Routine place id → world anchor. Every place a resident's routine names must exist here. */
  readonly places: Readonly<Record<string, Vec3>>;
  readonly needs: readonly NeedDefinition[];
  readonly policy: OffScreenPolicy;
  /** The game's near simulation. Far residents never touch it. */
  readonly near: NearAgents;
  readonly residents?: readonly OffScreenResidentSpec[];
  /** Register a devtools probe under this name so the overlay shows near/far counts. */
  readonly devtoolsName?: string;
}

export interface OffScreenWorld {
  add(spec: OffScreenResidentSpec): boolean;
  remove(id: string): boolean;
  has(id: string): boolean;
  count(): number;
  ids(): readonly string[];
  agent(id: string): OffScreenAgentView | null;
  pin(id: string, pinned?: boolean): boolean;
  needsAt(id: string, now: number): Readonly<Record<string, number>> | null;
  tick(dt: number, now: number, viewer: Vec3): void;
  stats(): OffScreenStats;
  retune(patch: OffScreenPolicyPatch): void;
  snapshot(): OffScreenSnapshot;
  restore(next: OffScreenSnapshot): void;
  dispose(): void;
}

interface Resident {
  id: string;
  home: Vec3;
  routine: RoutineTimeline | null;
  mode: OffScreenMode;
  position: Vec3;
  place: string | null;
  activity: string | null;
  nextPlace: string | null;
  stop: number;
  travelling: boolean;
  pinned: boolean;
  updatedAt: number;
  staleAt: number;
  needs: DecayMeterValues;
  distance: number;
}

const DEFAULT_SWITCH_BUDGET = 32;

function distanceBetween(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Create the world that decides which agents deserve a simulation. Residents are cheap state until
 * they come near, and cheap again when they leave; the cheap state is the schedule, the needs and
 * the last place, so a returning resident never pops in at the origin.
 *
 * @capability offscreen-world schedules agents near the player as real state and far ones as cheap state
 */
export function createOffScreenWorld(options: OffScreenOptions): OffScreenWorld {
  const places = options.places;
  const defs = options.needs.map((definition) => ({ ...definition }));
  const near = options.near;
  const residents: Resident[] = [];
  const residentOf = new Map<string, number>();

  let nearRadius = Math.max(0, options.policy.nearRadius);
  let farRadius = Math.max(nearRadius, options.policy.farRadius ?? nearRadius);
  let costModel = options.policy.costModel;
  let nearBudget = options.policy.nearBudget ?? null;
  let switchBudget = Math.max(1, Math.floor(options.policy.switchBudget ?? DEFAULT_SWITCH_BUDGET));

  let promotions = 0;
  let demotions = 0;
  let farRefreshes = 0;

  function placeAt(place: string, id: string): Vec3 {
    const anchor = places[place];
    if (anchor === undefined) throw new Error(`resident "${id}" follows a routine through unknown place "${place}"`);
    return anchor;
  }

  function goalFor(resident: Resident): Vec3 {
    if (resident.routine === null) return resident.home;
    const phase = resident.routine.phaseAt(resident.updatedAt);
    const target = phase.nextPlace ?? phase.place;
    return placeAt(target, resident.id);
  }

  function positionFor(resident: Resident, phase: RoutinePhase | null): Vec3 {
    if (phase === null || resident.routine === null) return resident.home;
    const from = placeAt(phase.place, resident.id);
    if (!phase.travelling || phase.nextPlace === null) return from;
    return lerp(from, placeAt(phase.nextPlace, resident.id), phase.progress);
  }

  function refreshCheap(resident: Resident, now: number): void {
    if (now <= resident.updatedAt) return;
    farRefreshes += 1;
    if (resident.routine === null) {
      resident.needs = decayMeters(resident.needs, defs, now - resident.updatedAt);
      resident.updatedAt = now;
      resident.staleAt = Infinity;
      return;
    }
    while (resident.updatedAt < now) {
      const boundary = Math.min(now, resident.staleAt);
      resident.needs = decayMeters(resident.needs, defs, boundary - resident.updatedAt);
      resident.updatedAt = boundary;
      if (boundary >= now) break;
      const phase = resident.routine.phaseAt(boundary);
      const arriving = !phase.travelling && Math.abs(phase.since - boundary) < 1e-6;
      resident.stop = phase.stop;
      resident.travelling = phase.travelling;
      resident.place = phase.place;
      resident.activity = phase.activity;
      resident.position = positionFor(resident, phase);
      if (arriving) {
        const stop = resident.routine.stops[phase.stop];
        if (stop?.refill != null) {
          resident.needs = { ...resident.needs };
          for (const needId of Object.keys(stop.refill)) {
            const def = defs.find((candidate) => candidate.id === needId);
            if (def === undefined) continue;
            const min = def.min ?? 0;
            resident.needs[needId] = Math.min(def.max, Math.max(min, (resident.needs[needId] ?? min) + stop.refill[needId]!));
          }
        }
      }
      const next = resident.routine.nextChangeAfter(resident.updatedAt);
      if (next > resident.updatedAt) {
        resident.staleAt = next;
      } else {
        // A schedule that cannot name a later change must not spin this catch-up loop; hold the
        // phase, decay to `now` and try once more a cycle later.
        resident.needs = decayMeters(resident.needs, defs, now - resident.updatedAt);
        resident.updatedAt = now;
        resident.staleAt = now + resident.routine.cycleSeconds;
        break;
      }
    }
  }

  function refreshNear(resident: Resident, now: number): void {
    if (resident.routine === null || now < resident.staleAt) return;
    const phase = resident.routine.phaseAt(now);
    const moved = phase.place !== resident.place || phase.nextPlace !== resident.nextPlace;
    resident.stop = phase.stop;
    resident.travelling = phase.travelling;
    resident.place = phase.place;
    resident.activity = phase.activity;
    resident.nextPlace = phase.nextPlace;
    resident.updatedAt = now;
    resident.staleAt = resident.routine.nextChangeAfter(now);
    if (moved) near.setGoal(resident.id, placeAt(phase.nextPlace ?? phase.place, resident.id));
  }

  function promote(resident: Resident, now: number): void {
    resolveFar(resident, now);
    const phase = resident.routine === null ? null : resident.routine.phaseAt(now);
    if (phase !== null) {
      resident.stop = phase.stop;
      resident.travelling = phase.travelling;
      resident.place = phase.place;
      resident.activity = phase.activity;
      resident.nextPlace = phase.nextPlace;
    }
    resident.mode = "near";
    promotions += 1;
    near.spawn({
      id: resident.id,
      position: resident.position,
      place: resident.place,
      activity: resident.activity,
      needs: { ...resident.needs },
      goal: goalFor(resident),
      stop: resident.stop,
      travelling: resident.travelling,
    });
  }

  function demote(resident: Resident, now: number): void {
    const handoff = near.despawn(resident.id);
    resident.mode = "far";
    demotions += 1;
    if (handoff !== null) {
      resident.position = handoff.position;
      resident.needs = { ...handoff.needs };
    }
    resident.updatedAt = now;
    resident.staleAt = resident.routine === null ? Infinity : resident.routine.nextChangeAfter(now);
  }

  function resolveFar(resident: Resident, now: number): void {
    refreshCheap(resident, now);
  }

  function probeLine(): string {
    let nearCount = 0;
    for (const resident of residents) if (resident.mode === "near") nearCount += 1;
    const decisions = near.decisions?.() ?? 0;
    return `${nearCount} near ${residents.length - nearCount} far ${promotions} promotions ${demotions} demotions ${farRefreshes} far refreshes ${decisions} decisions`;
  }

  const unregister = options.devtoolsName === undefined ? null : devtools.probes.register(options.devtoolsName, () => probeLine());

  function toResident(spec: OffScreenResidentSpec): Resident {
    if (spec.routine !== null && spec.routine !== undefined) {
      for (const stop of spec.routine.stops) placeAt(stop.place, spec.id);
    }
    const needs: DecayMeterValues = { ...initDecayMeters(defs) };
    if (spec.needs !== undefined) {
      for (const def of defs) {
        const saved = spec.needs[def.id];
        if (saved === undefined || !Number.isFinite(saved)) continue;
        const min = def.min ?? 0;
        needs[def.id] = Math.min(def.max, Math.max(min, saved));
      }
    }
    const resident: Resident = {
      id: spec.id,
      home: spec.home,
      routine: spec.routine ?? null,
      mode: "far",
      position: spec.home,
      place: null,
      activity: null,
      nextPlace: null,
      stop: 0,
      travelling: false,
      pinned: spec.pinned === true,
      updatedAt: 0,
      staleAt: 0,
      needs,
      distance: Infinity,
    };
    if (resident.routine !== null) {
      const phase = resident.routine.phaseAt(0);
      resident.stop = phase.stop;
      resident.travelling = phase.travelling;
      resident.place = phase.place;
      resident.activity = phase.activity;
      resident.nextPlace = phase.nextPlace;
      resident.position = positionFor(resident, phase);
      resident.staleAt = resident.routine.nextChangeAfter(0);
    }
    return resident;
  }

  for (const spec of options.residents ?? []) {
    if (residentOf.has(spec.id)) throw new Error(`duplicate off-screen resident "${spec.id}"`);
    const resident = toResident(spec);
    residentOf.set(spec.id, residents.length);
    residents.push(resident);
  }

  function indexOf(id: string): number {
    return residentOf.get(id) ?? -1;
  }

  function livePosition(resident: Resident): Vec3 {
    if (resident.mode === "near") {
      const live = near.position(resident.id);
      if (live !== null) return live;
    }
    return resident.position;
  }

  return {
    add(spec) {
      if (residentOf.has(spec.id)) return false;
      const resident = toResident(spec);
      residentOf.set(spec.id, residents.length);
      residents.push(resident);
      return true;
    },
    remove(id) {
      const at = indexOf(id);
      if (at < 0) return false;
      if (residents[at]!.mode === "near") near.despawn(id);
      const last = residents.pop()!;
      residentOf.delete(id);
      if (at < residents.length) {
        residents[at] = last;
        residentOf.set(last.id, at);
      }
      return true;
    },
    has: (id) => residentOf.has(id),
    count: () => residents.length,
    ids: () => residents.map((resident) => resident.id),
    agent(id) {
      const at = indexOf(id);
      if (at < 0) return null;
      const resident = residents[at]!;
      const live = resident.mode === "near" ? near.needs?.(resident.id) ?? null : null;
      return {
        id: resident.id,
        mode: resident.mode,
        position: livePosition(resident),
        place: resident.place,
        activity: resident.activity,
        stop: resident.stop,
        travelling: resident.travelling,
        needs: { ...(live ?? resident.needs) },
        pinned: resident.pinned,
        distance: resident.distance,
      };
    },
    pin(id, pinned = true) {
      const at = indexOf(id);
      if (at < 0) return false;
      residents[at]!.pinned = pinned;
      return true;
    },
    needsAt(id, now) {
      const at = indexOf(id);
      if (at < 0) return null;
      const resident = residents[at]!;
      if (resident.mode === "far") resolveFar(resident, now);
      else {
        const live = near.needs?.(id) ?? null;
        if (live !== null) return { ...live };
      }
      return { ...resident.needs };
    },
    tick(dt, now, viewer) {
      let switches = switchBudget;
      for (const resident of residents) {
        if (resident.mode === "far" && now >= resident.staleAt) refreshCheap(resident, now);
        resident.distance = distanceBetween(livePosition(resident), viewer);
        const wantsNear = resident.pinned || resident.distance <= (resident.mode === "near" ? farRadius : nearRadius);
        if (wantsNear === (resident.mode === "near")) continue;
        if (switches <= 0) continue;
        switches -= 1;
        if (wantsNear) promote(resident, now);
        else demote(resident, now);
      }

      if (nearBudget !== null && costModel !== undefined) {
        let total = 0;
        for (const resident of residents) if (resident.mode === "near") total += costModel(resident.id, resident.distance);
        while (total > nearBudget && switches > 0) {
          let worst: Resident | null = null;
          let worstCost = -Infinity;
          for (const resident of residents) {
            if (resident.mode !== "near" || resident.pinned) continue;
            const cost = costModel(resident.id, resident.distance);
            if (cost > worstCost) {
              worst = resident;
              worstCost = cost;
            }
          }
          if (worst === null) break;
          demote(worst, now);
          total -= worstCost;
          switches -= 1;
        }
      }

      near.tick(dt, now);

      for (const resident of residents) {
        if (resident.mode !== "near") continue;
        const live = near.position(resident.id);
        if (live !== null) resident.position = live;
        refreshNear(resident, now);
      }
    },
    stats() {
      let nearCount = 0;
      let farCount = 0;
      for (const resident of residents) {
        if (resident.mode === "near") nearCount += 1;
        else farCount += 1;
      }
      return {
        agents: residents.length,
        near: nearCount,
        far: farCount,
        promotions,
        demotions,
        farRefreshes,
        decisions: near.decisions?.() ?? 0,
      };
    },
    retune(patch) {
      if (patch.nearRadius !== undefined) nearRadius = Math.max(0, patch.nearRadius);
      if (patch.farRadius !== undefined) farRadius = Math.max(nearRadius, patch.farRadius);
      farRadius = Math.max(nearRadius, farRadius);
      if (patch.costModel !== undefined) costModel = patch.costModel;
      if (patch.nearBudget !== undefined) nearBudget = patch.nearBudget;
      if (patch.switchBudget !== undefined) switchBudget = Math.max(1, Math.floor(patch.switchBudget));
    },
    snapshot() {
      const copy = residents.map((resident) => {
        const live = resident.mode === "near" ? near.needs?.(resident.id) ?? null : null;
        const livePos = resident.mode === "near" ? near.position(resident.id) : null;
        return {
          id: resident.id,
          home: [resident.home[0], resident.home[1], resident.home[2]] as Vec3,
          mode: resident.mode,
          position: livePos === null ? resident.position : livePos,
          place: resident.place,
          activity: resident.activity,
          stop: resident.stop,
          travelling: resident.travelling,
          pinned: resident.pinned,
          updatedAt: resident.updatedAt,
          staleAt: Number.isFinite(resident.staleAt) ? resident.staleAt : null,
          needs: { ...(live ?? resident.needs) },
        };
      });
      return {
        policy: { nearRadius, farRadius, nearBudget, switchBudget },
        residents: copy,
      };
    },
    restore(next) {
      const authored = new Map<string, { home: Vec3; routine: RoutineTimeline | null }>();
      for (const resident of residents) authored.set(resident.id, { home: resident.home, routine: resident.routine });
      for (const resident of residents) {
        if (resident.mode === "near") near.despawn(resident.id);
      }
      residents.length = 0;
      residentOf.clear();
      nearRadius = Math.max(0, next.policy.nearRadius);
      farRadius = Math.max(nearRadius, next.policy.farRadius);
      nearBudget = next.policy.nearBudget;
      switchBudget = Math.max(1, Math.floor(next.policy.switchBudget));
      for (const saved of next.residents) {
        const source = authored.get(saved.id);
        const resident: Resident = {
          id: saved.id,
          home: source?.home ?? saved.home,
          routine: source?.routine ?? null,
          mode: saved.mode,
          position: saved.position,
          place: saved.place,
          activity: saved.activity,
          nextPlace: null,
          stop: saved.stop,
          travelling: saved.travelling,
          pinned: saved.pinned,
          updatedAt: saved.updatedAt,
          staleAt: saved.staleAt === null ? Infinity : saved.staleAt,
          needs: { ...saved.needs },
          distance: Infinity,
        };
        if (resident.routine !== null) {
          const phase = resident.routine.phaseAt(resident.updatedAt);
          resident.nextPlace = phase.nextPlace;
          if (resident.mode === "near") {
            near.spawn({
              id: resident.id,
              position: resident.position,
              place: resident.place,
              activity: resident.activity,
              needs: { ...resident.needs },
              goal: placeAt(phase.nextPlace ?? phase.place, resident.id),
              stop: resident.stop,
              travelling: resident.travelling,
            });
          }
        }
        residentOf.set(resident.id, residents.length);
        residents.push(resident);
      }
    },
    dispose() {
      unregister?.();
      near.dispose?.();
    },
  };
}
