import type { PerceptionService, PerceptionPosition } from "../../sensor/perception";
import type { Vec3 } from "../../world/geometry";

/** A unit that could hear a noise: its id and where it stands when the noise lands. */
export interface SoundHunter {
  id: string;
  position: Vec3;
}

/** One noise in the world, as the game produces it. */
export interface NoiseEvent {
  /** Who made the noise — the hearing owner records the memory against this id. */
  sourceId: string;
  position: Vec3;
  /** Seconds on the game clock, the same clock the perception service is given. */
  at: number;
  /** Multiplies `hearingRange` exactly as `PerceptionStimulus.loudness` does. Default `1`. */
  loudness?: number;
}

/** A hunter still working a noise, as the squad layer reads it this tick. */
export interface Investigation {
  hunterId: string;
  sourceId: string;
  /** Where the noise came from: the hearing owner's remembered position. */
  position: Vec3;
  /** Confidence left in the memory, `0..1`; it falls as the memory decays and ends the hunt at 0. */
  confidence: number;
  /** Seconds since the noise landed. */
  ageSeconds: number;
}

/** One noise and the hunters sent to it. Serializable, so a hunt survives a save. */
export interface SoundHuntEntry {
  noise: NoiseEvent;
  hunters: string[];
}

/** Serializable book-keeping: which noises are still being worked, and by whom. */
export interface SoundHuntSnapshot {
  entries: SoundHuntEntry[];
}

/** Everything the hunt reads and its bounds. */
export interface SoundHuntConfig {
  perception: PerceptionService;
  /** Candidates near a noise, bounded by the caller's roster. Called once per noise, not per tick. */
  hunters: (position: Vec3, hearingRange: number) => readonly SoundHunter[];
  /** The same hearing range given to `createPerception`. */
  hearingRange: number;
  /** Most hunters one noise sends. Default `3`. */
  maxInvestigators?: number;
  /** Confidence at or below which a hunter gives up and returns to its post. Default `0.15`. */
  giveUpConfidence?: number;
  /** Longest one hunt survives, seconds. Default `20`. */
  maxSeconds?: number;
  /** Most noises remembered at once; the oldest is dropped first. Default `16`. */
  maxNoises?: number;
}

/** Sound hunting: raise a noise, get the bounded set of enemies that go and look. */
export interface SoundHunt {
  /**
   * Record one noise in the hearing owner's stimulus stream and admit the nearest hunters to it.
   * Returns the admitted hunter ids so the caller can issue its own move order now; the decay and
   * the give-up are read back through {@link SoundHunt.investigations}.
   */
  noise(event: NoiseEvent): readonly string[];
  /** Hunters still working their noise at `nowMs`, with the memory's remaining confidence. */
  investigations(nowMs: number): Investigation[];
  snapshot(): SoundHuntSnapshot;
  restore(snapshot: SoundHuntSnapshot): void;
}

const DEFAULTS = {
  maxInvestigators: 3,
  giveUpConfidence: 0.15,
  maxSeconds: 20,
  maxNoises: 16,
};

function flatDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

/**
 * Make enemies investigate a noise, reusing the hearing owner.
 *
 * The noise goes into `PerceptionService.pushStimulus` as a `sound` stimulus, so the same range,
 * loudness and linear memory decay that every other hearing consumer gets apply here; this layer
 * adds only the two things a squad needs: a *bound* on how many enemies chase one noise, and a
 * *give-up* rule, both read back from that memory instead of a second copy of it. A sighting of the
 * source during the hunt raises the same memory's confidence, so an investigation escalates into a
 * pursuit without any bookkeeping here.
 *
 * @capability sound-hunting send a bounded set of nearby enemies to investigate a noise with decaying memory
 */
export function createSoundHunt(config: SoundHuntConfig): SoundHunt {
  const maxInvestigators = Math.max(0, Math.floor(config.maxInvestigators ?? DEFAULTS.maxInvestigators));
  const giveUp = Math.max(0, config.giveUpConfidence ?? DEFAULTS.giveUpConfidence);
  const maxSeconds = Math.max(0, config.maxSeconds ?? DEFAULTS.maxSeconds);
  const maxNoises = Math.max(1, Math.floor(config.maxNoises ?? DEFAULTS.maxNoises));

  let entries: SoundHuntEntry[] = [];

  return {
    noise(event) {
      if (!Number.isFinite(event.at)) throw new Error("noise.at must be finite.");
      const loudness = Math.max(0, event.loudness ?? 1);
      const audible = config.hearingRange * loudness;
      const ranked: SoundHunter[] = [];
      if (audible > 0) {
        for (const hunter of config.hunters(event.position, audible)) {
          if (hunter.id === event.sourceId) continue;
          if (flatDistance(hunter.position, event.position) >= audible) continue;
          ranked.push(hunter);
        }
      }
      ranked.sort((a, b) => {
        const distance = flatDistance(a.position, event.position) - flatDistance(b.position, event.position);
        if (Math.abs(distance) > 0.0001) return distance;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
      const admitted = ranked.slice(0, maxInvestigators).map((hunter) => hunter.id);

      config.perception.pushStimulus({
        kind: "sound",
        sourceId: event.sourceId,
        position: [...event.position] as PerceptionPosition,
        loudness,
        at: event.at,
      });

      const admittedSet = new Set(admitted);
      entries = entries
        .filter((entry) => entry.noise.sourceId !== event.sourceId)
        .map((entry) => ({ noise: entry.noise, hunters: entry.hunters.filter((id) => !admittedSet.has(id)) }))
        .filter((entry) => entry.hunters.length > 0);
      entries.push({
        noise: { ...event, position: [...event.position] as Vec3, loudness },
        hunters: admitted,
      });
      while (entries.length > maxNoises) entries.shift();
      return admitted;
    },
    investigations(nowMs) {
      const results: Investigation[] = [];
      const kept: SoundHuntEntry[] = [];
      for (const entry of entries) {
        const ageSeconds = Math.max(0, nowMs - entry.noise.at) / 1000;
        if (ageSeconds > maxSeconds) continue;
        const alive: string[] = [];
        for (const hunterId of entry.hunters) {
          const memory = config.perception.memoryOf(hunterId, entry.noise.sourceId);
          if (memory === null || memory.confidence <= giveUp) continue;
          alive.push(hunterId);
          results.push({
            hunterId,
            sourceId: entry.noise.sourceId,
            position: [...memory.lastKnownPos] as Vec3,
            confidence: memory.confidence,
            ageSeconds,
          });
        }
        if (alive.length > 0) kept.push({ noise: entry.noise, hunters: alive });
      }
      entries = kept;
      return results;
    },
    snapshot() {
      return {
        entries: entries.map((entry) => ({
          noise: { ...entry.noise, position: [...entry.noise.position] as Vec3 },
          hunters: [...entry.hunters],
        })),
      };
    },
    restore(snapshot) {
      entries = snapshot.entries.map((entry) => ({
        noise: { ...entry.noise, position: [...entry.noise.position] as Vec3 },
        hunters: [...entry.hunters],
      }));
    },
  };
}
