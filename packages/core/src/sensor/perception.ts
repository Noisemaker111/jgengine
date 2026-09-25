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
  lastSeenAt: number;
  lastKnownPos: PerceptionPosition;
  confidence: number;
}

/** Configuration for sight, hearing, memory decay, and optional occlusion. */
export interface PerceptionConfig {
  sightRange: number;
  sightConeDeg: number;
  hearingRange: number;
  memorySeconds: number;
  /** Most stimuli retained at once; the oldest are dropped first. Default 256. */
  maxStimuli?: number;
  occluded?: (from: PerceptionPosition, to: PerceptionPosition) => boolean;
}

/** Serializable state for a perception service. */
export interface PerceptionSnapshot {
  memories: Array<{ observerId: string; memory: PerceptionMemory }>;
  stimuli: PerceptionStimulus[];
  nowMs: number;
}

/** Stateful perception API with retuning and save/restore support. */
export interface PerceptionService {
  pushStimulus(stimulus: PerceptionStimulus): void;
  observe(observer: PerceptionObserver, candidates: readonly PerceptionCandidate[], nowMs: number): void;
  memory(observerId: string): PerceptionMemory[];
  /** Drop one remembered target, or everything an observer remembers (despawn, reset, disguise). */
  forget(observerId: string, targetId?: string): void;
  retune(patch: Partial<PerceptionConfig>): void;
  snapshot(): PerceptionSnapshot;
  restore(snapshot: PerceptionSnapshot): void;
}

function distance(a: PerceptionPosition, b: PerceptionPosition): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function confidenceAt(memory: PerceptionMemory, nowMs: number, memoryMs: number): number {
  return memory.confidence * Math.max(0, 1 - Math.max(0, nowMs - memory.lastSeenAt) / memoryMs);
}

function inSight(observer: PerceptionObserver, target: PerceptionPosition, config: PerceptionConfig): boolean {
  const dx = target[0] - observer.position[0];
  const dz = target[2] - observer.position[2];
  const range = Math.hypot(dx, dz);
  if (range > config.sightRange) return false;
  if (range < 1e-9) return true;
  let delta = Math.atan2(dx, dz) - observer.yaw;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta) <= (config.sightConeDeg * Math.PI) / 360;
}

function validate(config: PerceptionConfig): void {
  if (!Number.isFinite(config.sightRange) || config.sightRange < 0) throw new Error("sightRange must be non-negative.");
  if (!Number.isFinite(config.sightConeDeg) || config.sightConeDeg < 0 || config.sightConeDeg > 360) throw new Error("sightConeDeg must be between 0 and 360.");
  if (!Number.isFinite(config.hearingRange) || config.hearingRange < 0) throw new Error("hearingRange must be non-negative.");
  if (!Number.isFinite(config.memorySeconds) || config.memorySeconds <= 0) throw new Error("memorySeconds must be positive.");
  if (config.maxStimuli !== undefined && (!Number.isInteger(config.maxStimuli) || config.maxStimuli < 1)) throw new Error("maxStimuli must be a positive integer.");
}

const DEFAULT_MAX_STIMULI = 256;

/** Creates a deterministic sight, sound, and damage perception service with expiring target memory.
 * @capability perception-service retain sight, sound, and damage observations with range, cone, occlusion, and decay policy
 */
export function createPerception(initial: PerceptionConfig): PerceptionService {
  validate(initial);
  let config = { ...initial };
  let nowMs = 0;
  const stimuli: PerceptionStimulus[] = [];
  const memories = new Map<string, Map<string, PerceptionMemory>>();

  function remember(observerId: string, targetId: string, position: PerceptionPosition, at: number, confidence: number): void {
    if (confidence <= 0) return;
    let observerMemories = memories.get(observerId);
    if (observerMemories === undefined) {
      observerMemories = new Map();
      memories.set(observerId, observerMemories);
    }
    const previous = observerMemories.get(targetId);
    if (previous === undefined || at >= previous.lastSeenAt) {
      observerMemories.set(targetId, { targetId, lastSeenAt: at, lastKnownPos: [...position] as PerceptionPosition, confidence });
    }
  }

  function prune(): void {
    const memoryMs = config.memorySeconds * 1000;
    for (const [observerId, observerMemories] of memories) {
      for (const [targetId, memory] of observerMemories) {
        if (confidenceAt(memory, nowMs, memoryMs) <= 0) observerMemories.delete(targetId);
      }
      if (observerMemories.size === 0) memories.delete(observerId);
    }
    const cutoff = nowMs - memoryMs;
    let drop = Math.max(0, stimuli.length - (config.maxStimuli ?? DEFAULT_MAX_STIMULI));
    while (drop < stimuli.length && stimuli[drop]!.at < cutoff) drop += 1;
    if (drop > 0) stimuli.splice(0, drop);
  }

  return {
    pushStimulus(stimulus) {
      if (!Number.isFinite(stimulus.at)) throw new Error("stimulus.at must be finite.");
      if (stimulus.kind === "sound" && stimulus.loudness !== undefined && (!Number.isFinite(stimulus.loudness) || stimulus.loudness < 0)) {
        throw new Error("stimulus.loudness must be non-negative.");
      }
      let index = stimuli.length;
      while (index > 0 && stimuli[index - 1]!.at > stimulus.at) index -= 1;
      stimuli.splice(index, 0, { ...stimulus, position: [...stimulus.position] as PerceptionPosition });
      nowMs = Math.max(nowMs, stimulus.at);
      prune();
    },
    observe(observer, candidates, observedAt) {
      if (!Number.isFinite(observedAt)) throw new Error("nowMs must be finite.");
      nowMs = observedAt;
      for (const candidate of candidates) {
        if (!inSight(observer, candidate.position, config)) continue;
        if (config.occluded?.(observer.position, candidate.position)) continue;
        remember(observer.id, candidate.id, candidate.position, nowMs, 1);
      }
      for (const stimulus of stimuli) {
        if (stimulus.at > nowMs || stimulus.sourceId === observer.id) continue;
        const range = distance(observer.position, stimulus.position);
        if (stimulus.kind === "sound") {
          const audible = config.hearingRange * (stimulus.loudness ?? 1);
          if (range >= audible) continue;
          remember(observer.id, stimulus.sourceId, stimulus.position, stimulus.at, 1 - range / audible);
        } else if (stimulus.kind === "damage") {
          remember(observer.id, stimulus.sourceId, stimulus.position, stimulus.at, 1);
        }
      }
      prune();
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
    forget(observerId, targetId) {
      if (targetId === undefined) {
        memories.delete(observerId);
        return;
      }
      const observerMemories = memories.get(observerId);
      observerMemories?.delete(targetId);
      if (observerMemories?.size === 0) memories.delete(observerId);
    },
    retune(patch) {
      config = { ...config, ...patch };
      validate(config);
      prune();
    },
    snapshot() {
      const result: PerceptionSnapshot = { memories: [], stimuli: stimuli.map((stimulus) => ({ ...stimulus, position: [...stimulus.position] as PerceptionPosition })), nowMs };
      for (const [observerId, observerMemories] of memories) for (const memory of observerMemories.values()) result.memories.push({ observerId, memory: { ...memory, lastKnownPos: [...memory.lastKnownPos] as PerceptionPosition } });
      return result;
    },
    restore(snapshot) {
      memories.clear();
      stimuli.length = 0;
      nowMs = snapshot.nowMs;
      stimuli.push(...snapshot.stimuli.map((stimulus) => ({ ...stimulus, position: [...stimulus.position] as PerceptionPosition })));
      for (const entry of snapshot.memories) remember(entry.observerId, entry.memory.targetId, entry.memory.lastKnownPos, entry.memory.lastSeenAt, entry.memory.confidence);
      prune();
    },
  };
}
