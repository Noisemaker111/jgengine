import { devtools } from "../devtools/devtools";
import { sightLineBlocked, type SightSolids } from "./sightLine";

/** A world position used by perception, in `[x, y, z]` order. */
export type PerceptionPosition = readonly [number, number, number];

/** The kinds of stimulus the perception service can retain. */
export type PerceptionStimulusKind = "sight" | "sound" | "damage";

/** An event that can seed an observer's memory. */
export interface PerceptionStimulus {
  kind: PerceptionStimulusKind;
  sourceId: string;
  position: PerceptionPosition;
  /** Multiplies `hearingRange` for this sound: a footstep might be `0.3`, a gunshot `4`. Default `1`. */
  loudness?: number;
  at: number;
}

/** The observer pose used for a sight check. */
export interface PerceptionObserver {
  id: string;
  position: PerceptionPosition;
  yaw: number;
}

/** A candidate target considered by a sight check. */
export interface PerceptionCandidate {
  id: string;
  position: PerceptionPosition;
}

/** A remembered target and its linearly decaying confidence. */
export interface PerceptionMemory {
  targetId: string;
  /** When the fact was observed, on the same clock `observe` is given; its age is `now − lastSeenAt`. */
  lastSeenAt: number;
  lastKnownPos: PerceptionPosition;
  /** 1 at the moment of the sighting, falling to 0 across `memorySeconds`. */
  confidence: number;
  /** Whose senses produced the fact: this observer's id for its own sighting, a squadmate's for a shared one. */
  sourceId: string;
  /** Observe pass that recorded the fact, so a shared sighting is attributable to the tick it arrived. */
  sourceTick: number;
}

/** Configuration for sight, hearing, memory decay, squad sharing and optional occlusion. */
export interface PerceptionConfig {
  sightRange: number;
  sightConeDeg: number;
  hearingRange: number;
  memorySeconds: number;
  /** Most stimuli retained at once; the oldest are dropped first. Default 256. */
  maxStimuli?: number;
  /**
   * Cheap "nothing blocks the segment from `from` to `to`" test, supplied by the game's collision
   * layer. Only called for pairs already inside range and cone, so the costly test sees the pruned
   * set. Omit for open ground.
   */
  isSegmentClear?: (from: PerceptionPosition, to: PerceptionPosition) => boolean;
  /**
   * World collision the sight line is tested against — pass the same set movement and bullets use
   * (`ctx.world.solids`). When given, a sighting also needs a clear segment, so a target behind a
   * building is not seen. Ignored when `isSegmentClear` is supplied. Omit for open ground and the
   * cheap cone.
   */
  solids?: SightSolids;
  /**
   * Most sight lines one `observe` pass (one agent's tick) may ray against `solids`. Default 64.
   * `0` grants no sight at all; omit `solids` instead to keep the cheap cone.
   */
  maxSightRaysPerPass?: number;
  /**
   * The other members of an observer's squad, by id. A sighting one member makes is written into
   * each mate's memory with the seeing member's id and the pass it happened on. Omit for lone
   * observers. Keep the returned set small — the roster is the caller's, so the caller bounds it.
   */
  squadMates?: (observerId: string) => Iterable<string>;
  /** Most sighting shares one pass may write, so a large squad cannot blow the tick budget. Default 64. */
  maxSharesPerTick?: number;
  /** Register a devtools probe under this name so the overlay shows perception work and memory. */
  devtoolsName?: string;
}

/** Counters a perf test or a devtools probe reads. Reset with {@link PerceptionService.resetStats}. */
export interface PerceptionStats {
  /** Observe passes run. Keeps counting across `resetStats`, since it is also the recorded tick. */
  passes: number;
  /** `(observer, candidate)` pairs examined — one check per pair per pass. */
  pairChecks: number;
  /** Pairs rejected by distance before any cone or occlusion work. */
  rangeCulled: number;
  /** Pairs inside sight range, so they paid the cone test. */
  coneTests: number;
  /** Sight lines tested for occlusion: calls into `isSegmentClear`, else rays against `solids`. */
  occlusionChecks: number;
  /** Sightings the per-pass ray budget stopped us checking; they fail closed, so no sighting was granted. */
  occlusionDropped: number;
  /** Pairs that produced the observer's own sighting. */
  sightings: number;
  /** Sound and damage stimuli an observer resolved inside its hearing range. */
  heard: number;
  /** Sightings written into a squadmate's memory. */
  shares: number;
  /** Sightings the per-pass share cap kept from being broadcast. */
  shareDropped: number;
}

/** Serializable state for a perception service. */
export interface PerceptionSnapshot {
  memories: Array<{ observerId: string; memory: PerceptionMemory }>;
  stimuli: Array<PerceptionStimulus & { seq?: number }>;
  nowMs: number;
  /** Per observer, the last stimulus sequence number it has already judged. Absent in older saves. */
  heard?: Record<string, number>;
  nextSeq?: number;
  /** Observe passes recorded, which is also the tick a memory carries. Absent in older saves. */
  passes?: number;
}

/** Stateful perception API with retuning and save/restore support. */
export interface PerceptionService {
  pushStimulus(stimulus: PerceptionStimulus): void;
  observe(observer: PerceptionObserver, candidates: readonly PerceptionCandidate[], nowMs: number): void;
  memory(observerId: string): PerceptionMemory[];
  /** One remembered target with its confidence now, or `null` when never seen or already faded. */
  memoryOf(observerId: string, targetId: string): PerceptionMemory | null;
  /** Drop one remembered target, or everything an observer remembers (despawn, reset, disguise). */
  forget(observerId: string, targetId?: string): void;
  stats(): PerceptionStats;
  /** Zero the work counters, keeping the pass count that memories are stamped with. */
  resetStats(): void;
  retune(patch: Partial<Omit<PerceptionConfig, "devtoolsName">>): void;
  snapshot(): PerceptionSnapshot;
  restore(snapshot: PerceptionSnapshot): void;
  /** Drop the devtools probe registered by `devtoolsName`. Safe to call twice. */
  dispose(): void;
}

type StoredStimulus = PerceptionStimulus & { seq: number };

function distance(a: PerceptionPosition, b: PerceptionPosition): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function confidenceAt(memory: PerceptionMemory, nowMs: number, memoryMs: number): number {
  return memory.confidence * Math.max(0, 1 - Math.max(0, nowMs - memory.lastSeenAt) / memoryMs);
}

function validate(config: PerceptionConfig): void {
  if (!Number.isFinite(config.sightRange) || config.sightRange < 0) throw new Error("sightRange must be non-negative.");
  if (!Number.isFinite(config.sightConeDeg) || config.sightConeDeg < 0 || config.sightConeDeg > 360) throw new Error("sightConeDeg must be between 0 and 360.");
  if (!Number.isFinite(config.hearingRange) || config.hearingRange < 0) throw new Error("hearingRange must be non-negative.");
  if (!Number.isFinite(config.memorySeconds) || config.memorySeconds <= 0) throw new Error("memorySeconds must be positive.");
  if (config.maxStimuli !== undefined && (!Number.isInteger(config.maxStimuli) || config.maxStimuli < 1)) throw new Error("maxStimuli must be a positive integer.");
  if (config.maxSharesPerTick !== undefined && (!Number.isInteger(config.maxSharesPerTick) || config.maxSharesPerTick < 0)) {
    throw new Error("maxSharesPerTick must be a non-negative integer.");
  }
  if (config.maxSightRaysPerPass !== undefined && (!Number.isInteger(config.maxSightRaysPerPass) || config.maxSightRaysPerPass < 0)) {
    throw new Error("maxSightRaysPerPass must be a non-negative integer.");
  }
}

const DEFAULT_MAX_STIMULI = 256;
const DEFAULT_MAX_SHARES = 64;
const DEFAULT_MAX_SIGHT_RAYS = 64;

/**
 * Creates a deterministic sight, sound, and damage perception service with expiring target memory.
 * Signals are judged in the order the caller supplies them, never from the wall clock.
 *
 * A sighting needs range, cone and a clear line; a sound carries `hearingRange × loudness` and
 * fades with the distance it crossed, so a distant footstep is inaudible while a near gunshot is
 * not. Memory is the only record of "seen recently": each fact fades linearly over `memorySeconds`
 * and is then gone. With `squadMates` injected, a sighting one member makes lands in every mate's
 * memory stamped with the seeing member and the pass, which is what lets a squad react to one pair
 * of eyes without each member re-seeing anything.
 *
 * @capability perception-service retain sightings, sounds and damage with cone, range, occlusion, decaying memory and shared squad knowledge
 */
export function createPerception(initial: PerceptionConfig): PerceptionService {
  validate(initial);
  let config = { ...initial };
  let maxShares = config.maxSharesPerTick ?? DEFAULT_MAX_SHARES;
  let maxSightRays = config.maxSightRaysPerPass ?? DEFAULT_MAX_SIGHT_RAYS;
  let nowMs = 0;
  let passes = 0;
  const stimuli: StoredStimulus[] = [];
  const heard = new Map<string, number>();
  let nextSeq = 1;
  const memories = new Map<string, Map<string, PerceptionMemory>>();
  const stats: PerceptionStats = {
    passes: 0,
    pairChecks: 0,
    rangeCulled: 0,
    coneTests: 0,
    occlusionChecks: 0,
    occlusionDropped: 0,
    sightings: 0,
    heard: 0,
    shares: 0,
    shareDropped: 0,
  };
  const fresh: PerceptionCandidate[] = [];

  function remember(
    observerId: string,
    targetId: string,
    position: PerceptionPosition,
    at: number,
    confidence: number,
    sourceId: string,
    sourceTick: number,
  ): void {
    if (confidence <= 0) return;
    let observerMemories = memories.get(observerId);
    if (observerMemories === undefined) {
      observerMemories = new Map();
      memories.set(observerId, observerMemories);
    }
    const previous = observerMemories.get(targetId);
    if (previous === undefined || at >= previous.lastSeenAt) {
      observerMemories.set(targetId, {
        targetId,
        lastSeenAt: at,
        lastKnownPos: [...position] as PerceptionPosition,
        confidence,
        sourceId,
        sourceTick,
      });
    }
  }

  function pruneObserver(observerId: string): void {
    const observerMemories = memories.get(observerId);
    if (observerMemories === undefined) return;
    const memoryMs = config.memorySeconds * 1000;
    for (const [targetId, memory] of observerMemories) {
      if (confidenceAt(memory, nowMs, memoryMs) <= 0) observerMemories.delete(targetId);
    }
    if (observerMemories.size === 0) memories.delete(observerId);
  }

  function pruneStimuli(): void {
    const cutoff = nowMs - config.memorySeconds * 1000;
    let drop = Math.max(0, stimuli.length - (config.maxStimuli ?? DEFAULT_MAX_STIMULI));
    while (drop < stimuli.length && stimuli[drop]!.at < cutoff) drop += 1;
    if (drop > 0) stimuli.splice(0, drop);
  }

  /** Every observer's memory, not just the one that just observed — saving, retuning and restoring only. */
  function pruneAll(): void {
    for (const observerId of memories.keys()) pruneObserver(observerId);
    pruneStimuli();
  }

  function share(mateId: string, sighting: PerceptionCandidate, seerId: string, tick: number): void {
    const existing = memories.get(mateId)?.get(sighting.id);
    // The mate's own sighting at or after this instant is better evidence than a hand-off.
    if (existing !== undefined && existing.lastSeenAt >= nowMs) return;
    remember(mateId, sighting.id, sighting.position, nowMs, 1, seerId, tick);
  }

  function rememberedCount(): number {
    let total = 0;
    for (const observerMemories of memories.values()) total += observerMemories.size;
    return total;
  }

  function debugLine(): string {
    const work = `${stats.pairChecks} pairs ${stats.rangeCulled} culled ${stats.occlusionChecks} los ${stats.occlusionDropped > 0 ? `${stats.occlusionDropped} unchecked ` : ""}${stats.sightings} sights ${stats.heard} heard`;
    const squad = stats.shareDropped > 0 ? `${stats.shares} shared ${stats.shareDropped} dropped` : `${stats.shares} shared`;
    return `${memories.size} observers ${rememberedCount()} remembered · ${work} · ${squad}`;
  }

  const unregister =
    config.devtoolsName === undefined ? null : devtools.probes.register(config.devtoolsName, () => debugLine());

  return {
    pushStimulus(stimulus) {
      if (!Number.isFinite(stimulus.at)) throw new Error("stimulus.at must be finite.");
      if (stimulus.kind === "sound" && stimulus.loudness !== undefined && (!Number.isFinite(stimulus.loudness) || stimulus.loudness < 0)) {
        throw new Error("stimulus.loudness must be non-negative.");
      }
      let index = stimuli.length;
      while (index > 0 && stimuli[index - 1]!.at > stimulus.at) index -= 1;
      stimuli.splice(index, 0, { ...stimulus, position: [...stimulus.position] as PerceptionPosition, seq: nextSeq++ });
      nowMs = Math.max(nowMs, stimulus.at);
      pruneStimuli();
    },
    observe(observer, candidates, observedAt) {
      if (!Number.isFinite(observedAt)) throw new Error("nowMs must be finite.");
      nowMs = observedAt;
      passes += 1;
      stats.passes = passes;
      const tick = passes;
      const halfAngle = (config.sightConeDeg * Math.PI) / 360;
      const isClear = config.isSegmentClear;
      const solids = isClear === undefined ? config.solids : undefined;
      let rays = maxSightRays;
      fresh.length = 0;

      for (const candidate of candidates) {
        stats.pairChecks += 1;
        const dx = candidate.position[0] - observer.position[0];
        const dz = candidate.position[2] - observer.position[2];
        const range = Math.sqrt(dx * dx + dz * dz);
        if (range > config.sightRange) {
          stats.rangeCulled += 1;
          continue;
        }
        stats.coneTests += 1;
        if (range >= 1e-9) {
          let delta = Math.atan2(dx, dz) - observer.yaw;
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          if (Math.abs(delta) > halfAngle) continue;
        }
        if (isClear !== undefined) {
          stats.occlusionChecks += 1;
          if (!isClear(observer.position, candidate.position)) continue;
        } else if (solids !== undefined) {
          if (rays <= 0) {
            stats.occlusionDropped += 1;
            continue;
          }
          rays -= 1;
          stats.occlusionChecks += 1;
          if (sightLineBlocked(solids, observer.position, candidate.position)) continue;
        }
        stats.sightings += 1;
        remember(observer.id, candidate.id, candidate.position, nowMs, 1, observer.id, tick);
        fresh.push(candidate);
      }

      const mates = config.squadMates;
      if (mates !== undefined && fresh.length > 0) {
        let budget = maxShares;
        for (const sighting of fresh) {
          for (const mateId of mates(observer.id)) {
            if (mateId === observer.id) continue;
            if (budget <= 0) {
              stats.shareDropped += 1;
              continue;
            }
            budget -= 1;
            stats.shares += 1;
            share(mateId, sighting, observer.id, tick);
          }
        }
      }

      // Each observer judges a stimulus once, from where it stood when it first observed after the
      // stimulus; re-judging every tick would make an old noise louder as the observer walks toward it.
      const judgedThrough = heard.get(observer.id) ?? 0;
      let judged = judgedThrough;
      let firstFuture = Number.POSITIVE_INFINITY;
      for (const stimulus of stimuli) {
        if (stimulus.seq <= judgedThrough) continue;
        if (stimulus.at > nowMs) {
          firstFuture = Math.min(firstFuture, stimulus.seq);
          continue;
        }
        judged = Math.max(judged, stimulus.seq);
        if (stimulus.sourceId === observer.id) continue;
        const range = distance(observer.position, stimulus.position);
        if (stimulus.kind === "sound") {
          const audible = config.hearingRange * (stimulus.loudness ?? 1);
          if (range >= audible) continue;
          stats.heard += 1;
          remember(observer.id, stimulus.sourceId, stimulus.position, stimulus.at, 1 - range / audible, observer.id, tick);
        } else if (stimulus.kind === "damage") {
          stats.heard += 1;
          remember(observer.id, stimulus.sourceId, stimulus.position, stimulus.at, 1, observer.id, tick);
        }
      }
      heard.set(observer.id, Math.min(judged, firstFuture - 1));
      pruneObserver(observer.id);
    },
    memory(observerId) {
      const observerMemories = memories.get(observerId);
      if (observerMemories === undefined) return [];
      const memoryMs = config.memorySeconds * 1000;
      const result: PerceptionMemory[] = [];
      for (const memory of observerMemories.values()) {
        const confidence = confidenceAt(memory, nowMs, memoryMs);
        if (confidence > 0) result.push({ ...memory, lastKnownPos: [...memory.lastKnownPos] as PerceptionPosition, confidence });
      }
      return result;
    },
    memoryOf(observerId, targetId) {
      const memory = memories.get(observerId)?.get(targetId);
      if (memory === undefined) return null;
      const confidence = confidenceAt(memory, nowMs, config.memorySeconds * 1000);
      if (confidence <= 0) return null;
      return { ...memory, lastKnownPos: [...memory.lastKnownPos] as PerceptionPosition, confidence };
    },
    forget(observerId, targetId) {
      if (targetId === undefined) {
        memories.delete(observerId);
        return;
      }
      const observerMemories = memories.get(observerId);
      observerMemories?.delete(targetId);
      if (observerMemories?.size === 0) memories.delete(observerId);
    },
    stats: () => ({ ...stats }),
    resetStats() {
      stats.pairChecks = 0;
      stats.rangeCulled = 0;
      stats.coneTests = 0;
      stats.occlusionChecks = 0;
      stats.occlusionDropped = 0;
      stats.sightings = 0;
      stats.heard = 0;
      stats.shares = 0;
      stats.shareDropped = 0;
    },
    retune(patch) {
      config = { ...config, ...patch };
      validate(config);
      maxShares = config.maxSharesPerTick ?? DEFAULT_MAX_SHARES;
      maxSightRays = config.maxSightRaysPerPass ?? DEFAULT_MAX_SIGHT_RAYS;
      pruneAll();
    },
    snapshot() {
      pruneAll();
      const result: PerceptionSnapshot = {
        memories: [],
        stimuli: stimuli.map((stimulus) => ({ ...stimulus, position: [...stimulus.position] as PerceptionPosition })),
        nowMs,
        heard: Object.fromEntries(heard),
        nextSeq,
        passes,
      };
      for (const [observerId, observerMemories] of memories) for (const memory of observerMemories.values()) result.memories.push({ observerId, memory: { ...memory, lastKnownPos: [...memory.lastKnownPos] as PerceptionPosition } });
      return result;
    },
    restore(snapshot) {
      memories.clear();
      stimuli.length = 0;
      nowMs = snapshot.nowMs;
      passes = snapshot.passes ?? 0;
      stats.passes = passes;
      heard.clear();
      for (const [observerId, seq] of Object.entries(snapshot.heard ?? {})) heard.set(observerId, seq);
      let seq = 0;
      for (const stimulus of snapshot.stimuli) {
        seq = stimulus.seq ?? seq + 1;
        stimuli.push({ ...stimulus, position: [...stimulus.position] as PerceptionPosition, seq });
      }
      nextSeq = Math.max(snapshot.nextSeq ?? 0, seq + 1);
      for (const entry of snapshot.memories) {
        const saved = entry.memory;
        remember(entry.observerId, saved.targetId, saved.lastKnownPos, saved.lastSeenAt, saved.confidence, saved.sourceId ?? entry.observerId, saved.sourceTick ?? 0);
      }
      pruneAll();
    },
    dispose() {
      unregister?.();
    },
  };
}
