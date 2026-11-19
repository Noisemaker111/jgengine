import { createSoundHunt, type Investigation, type NoiseEvent, type SoundHunter } from "@jgengine/core/ai/director/sound";
import { createPerception } from "@jgengine/core/sensor/perception";

export interface ShotHuntOptions {
  hearingRange: number;
  /** Seconds a noise stays in memory before it has fully faded. */
  memorySeconds: number;
  maxInvestigators?: number;
  giveUpConfidence?: number;
  /** Longest one hunt survives, seconds. Default `20`. */
  maxSeconds?: number;
}

export interface ShotHunt {
  noise(event: NoiseEvent): readonly string[];
  heard(nowMs: number): Investigation[];
  investigations(nowMs: number): Investigation[];
}

/**
 * Firing loudly draws a bounded set of nearby enemies.
 *
 * This is a thin binding of `ai/director/sound` to a game roster: the noise goes through the same
 * perception service every other hearing consumer uses, and both the bound (how many come) and the
 * give-up (when they stop) are read back from that memory rather than kept in a second table. The
 * game only supplies who could hear it and the same clock it uses everywhere else.
 */
export function createShotHunt(roster: () => readonly SoundHunter[], options: ShotHuntOptions): ShotHunt {
  const hearingRange = Math.max(0, options.hearingRange);
  const perception = createPerception({
    sightRange: 0,
    sightConeDeg: 360,
    hearingRange,
    memorySeconds: Math.max(0.5, options.memorySeconds),
  });
  const hunt = createSoundHunt({
    perception,
    hearingRange,
    ...(options.maxInvestigators === undefined ? {} : { maxInvestigators: options.maxInvestigators }),
    ...(options.giveUpConfidence === undefined ? {} : { giveUpConfidence: options.giveUpConfidence }),
    ...(options.maxSeconds === undefined ? {} : { maxSeconds: options.maxSeconds }),
    hunters: () => roster(),
  });

  return {
    noise(event: NoiseEvent): readonly string[] {
      return hunt.noise(event);
    },
    heard(nowMs: number): Investigation[] {
      // The hunt reads the hearing owner's memory, so the memory has to be advanced before it is read.
      for (const hunter of roster()) {
        perception.observe({ id: hunter.id, position: hunter.position, yaw: 0 }, [], nowMs);
      }
      return hunt.investigations(nowMs);
    },
    investigations(nowMs: number): Investigation[] {
      return hunt.investigations(nowMs);
    },
  };
}
